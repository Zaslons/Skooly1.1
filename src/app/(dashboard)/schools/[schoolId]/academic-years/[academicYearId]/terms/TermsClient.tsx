"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";
import { archiveTermAction, createTermAction, setActiveTermAction, updateTermAction } from "@/lib/actions/termActions";

type Term = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  isArchived: boolean;
};

type TermsClientProps = {
  schoolId: string;
  academicYearId: string;
  academicYearName: string;
  isAcademicYearArchived: boolean;
  initialTerms: Term[];
  automationSummary: {
    activeAcademicYear: { id: string; name: string; startDate: string; endDate: string } | null;
    activeTerm: { id: string; name: string; startDate: string; endDate: string } | null;
    nextAcademicYear: { id: string; name: string; startDate: string; endDate: string } | null;
  };
};

const Button = ({ onClick, children, variant = "primary", ...props }: any) => {
  const baseStyle = "px-4 py-2 rounded font-semibold text-sm";
  const variants: { [key: string]: string } = {
    primary: "bg-blue-500 hover:bg-blue-600 text-white",
    secondary: "bg-gray-200 hover:bg-gray-300 text-gray-700",
    danger: "bg-red-500 hover:bg-red-600 text-white",
    outline: "border border-gray-300 hover:bg-gray-100 text-gray-700",
  };
  return (
    <button onClick={onClick} className={`${baseStyle} ${variants[variant]}`} {...props}>
      {children}
    </button>
  );
};

const FormModal = ({ isOpen, onClose, title, children }: any) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
        <h2 className="text-xl font-semibold mb-4">{title}</h2>
        {children}
        <div className="mt-4 text-right">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};

export default function TermsClient({
  schoolId,
  academicYearId,
  academicYearName,
  isAcademicYearArchived,
  initialTerms,
  automationSummary,
}: TermsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [terms, setTerms] = useState<Term[]>(initialTerms);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [currentTerm, setCurrentTerm] = useState<Term | null>(null);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    setTerms(initialTerms);
  }, [initialTerms]);

  const hasActiveTerm = useMemo(
    () => terms.some((term) => {
      if (term.isArchived) return false;
      const now = new Date();
      const start = new Date(term.startDate);
      const end = new Date(term.endDate);
      return start <= now && end >= now;
    }),
    [terms]
  );

  const openModal = (mode: "create" | "edit", term: Term | null = null) => {
    setModalMode(mode);
    if (mode === "edit" && term) {
      setCurrentTerm(term);
      setName(term.name);
      setStartDate(new Date(term.startDate).toISOString().split("T")[0]);
      setEndDate(new Date(term.endDate).toISOString().split("T")[0]);
    } else {
      setCurrentTerm(null);
      setName("");
      setStartDate("");
      setEndDate("");
    }
    setIsModalOpen(true);
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name || !startDate || !endDate) {
      toast.error("Please fill all fields.");
      return;
    }
    if (new Date(startDate) >= new Date(endDate)) {
      toast.error("Start date must be before end date.");
      return;
    }

    startTransition(async () => {
      let result;
      if (modalMode === "create") {
        result = await createTermAction({
          schoolId,
          academicYearId,
          name,
          startDate: new Date(startDate).toISOString(),
          endDate: new Date(endDate).toISOString(),
        });
      } else if (currentTerm) {
        result = await updateTermAction(schoolId, academicYearId, currentTerm.id, {
          name,
          startDate: new Date(startDate).toISOString(),
          endDate: new Date(endDate).toISOString(),
        });
      }

      if (result?.success) {
        toast.success(result.message);
        setIsModalOpen(false);
        router.refresh();
      } else if (result) {
        toast.error(result.message);
      }
    });
  };

  const getTermStatus = (term: Term) => {
    if (term.isArchived) return "Archived";
    const now = new Date();
    const start = new Date(term.startDate);
    const end = new Date(term.endDate);
    if (start <= now && end >= now) return "Active";
    if (end < now) return "Past";
    return "Upcoming";
  };

  const handleArchive = (term: Term) => {
    const actionText = term.isArchived ? "unarchive" : "archive";
    if (!confirm(`Are you sure you want to ${actionText} this term?`)) return;
    startTransition(async () => {
      const result = term.isArchived
        ? await updateTermAction(schoolId, academicYearId, term.id, { isArchived: false })
        : await archiveTermAction(schoolId, academicYearId, term.id);
      if (result.success) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  };

  const handleActivate = (termId: string) => {
    startTransition(async () => {
      const result = await setActiveTermAction(schoolId, academicYearId, termId);
      if (result.success) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  };

  const handleDeactivate = (termId: string) => {
    startTransition(async () => {
      const result = await updateTermAction(schoolId, academicYearId, termId, { isActive: false });
      if (result.success) {
        toast.success("Term deactivated successfully.");
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  };

  return (
    <div>
      <div className="mb-4 p-4 rounded-md border border-blue-200 bg-blue-50">
        <h2 className="text-sm font-semibold text-blue-900 mb-2">Automation Settings</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-blue-700 font-medium">Auto-active Academic Year</p>
            {automationSummary.activeAcademicYear ? (
              <p className="text-gray-800">
                {automationSummary.activeAcademicYear.name} (
                {new Date(automationSummary.activeAcademicYear.startDate).toLocaleDateString()} -{" "}
                {new Date(automationSummary.activeAcademicYear.endDate).toLocaleDateString()})
              </p>
            ) : (
              <p className="text-gray-600">No active academic year by date.</p>
            )}
          </div>
          <div>
            <p className="text-blue-700 font-medium">Auto-active Term</p>
            {automationSummary.activeTerm ? (
              <p className="text-gray-800">
                {automationSummary.activeTerm.name} (
                {new Date(automationSummary.activeTerm.startDate).toLocaleDateString()} -{" "}
                {new Date(automationSummary.activeTerm.endDate).toLocaleDateString()})
              </p>
            ) : (
              <p className="text-gray-600">No active term by date.</p>
            )}
          </div>
          <div>
            <p className="text-blue-700 font-medium">Next Auto-generated Year</p>
            {automationSummary.nextAcademicYear ? (
              <p className="text-gray-800">
                {automationSummary.nextAcademicYear.name} (
                {new Date(automationSummary.nextAcademicYear.startDate).toLocaleDateString()} -{" "}
                {new Date(automationSummary.nextAcademicYear.endDate).toLocaleDateString()})
              </p>
            ) : (
              <p className="text-gray-600">No upcoming academic year available.</p>
            )}
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-3 items-center justify-between">
        <div className="text-sm text-gray-600">
          {isAcademicYearArchived ? (
            <span className="text-red-600 font-medium">
              This academic year is archived. Term creation/activation is blocked.
            </span>
          ) : (
            <span>
              {hasActiveTerm ? "An active term is set." : "No active term set yet."}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push(`/schools/${schoolId}/academic-years`)}>
            Back to Academic Years
          </Button>
          <Button
            variant="primary"
            onClick={() => openModal("create")}
            disabled={isPending || isAcademicYearArchived}
          >
            Add New Term
          </Button>
        </div>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Start Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">End Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {terms.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-sm text-gray-500 text-center">
                  No terms found for {academicYearName}.
                </td>
              </tr>
            )}
            {terms.map((term) => (
              <tr key={term.id} className={term.isArchived ? "bg-gray-100 opacity-70" : ""}>
                <td className="px-6 py-4 text-sm font-medium text-gray-900">{term.name}</td>
                <td className="px-6 py-4 text-sm text-gray-500">{new Date(term.startDate).toLocaleDateString()}</td>
                <td className="px-6 py-4 text-sm text-gray-500">{new Date(term.endDate).toLocaleDateString()}</td>
                <td className="px-6 py-4 text-sm">
                  <span
                    className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      term.isArchived
                        ? "bg-gray-100 text-gray-800"
                        : getTermStatus(term) === "Active"
                        ? "bg-green-100 text-green-800"
                        : "bg-yellow-100 text-yellow-800"
                    }`}
                  >
                    {getTermStatus(term)}
                  </span>
                </td>
                <td className="px-6 py-4 text-right text-sm font-medium space-x-2">
                  {!term.isArchived && (
                    <>
                      <Button variant="outline" onClick={() => openModal("edit", term)} disabled={isPending}>
                        Edit
                      </Button>
                      {getTermStatus(term) !== "Active" ? (
                        <Button variant="outline" onClick={() => handleActivate(term.id)} disabled={isPending}>
                          Activate
                        </Button>
                      ) : (
                        <Button variant="outline" onClick={() => handleDeactivate(term.id)} disabled={isPending}>
                          Deactivate
                        </Button>
                      )}
                    </>
                  )}
                  <Button variant="outline" onClick={() => handleArchive(term)} disabled={isPending}>
                    {term.isArchived ? "Unarchive" : "Archive"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <FormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={modalMode === "create" ? "Create Term" : "Edit Term"}
      >
        <form onSubmit={onSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              required
              disabled={isPending}
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              required
              disabled={isPending}
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              required
              disabled={isPending}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isPending || isAcademicYearArchived}>
              {isPending ? "Saving..." : modalMode === "create" ? "Create" : "Save"}
            </Button>
          </div>
        </form>
      </FormModal>
    </div>
  );
}
