'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import { FileText } from 'lucide-react';
import {
  createCurriculumAction,
  updateCurriculumAction,
  deleteCurriculumAction,
  createCurriculumBookAction,
  updateCurriculumBookAction,
  deleteCurriculumBookAction,
} from '@/lib/actions/curriculumActions';
import {
  previewCopyCurriculumFromYearAction,
  applyCopyCurriculumFromYearAction,
} from '@/lib/actions/curriculumCopyActions';
import type { AcademicYear, CurriculumBook, Grade, Subject } from '@prisma/client';
import type { CurriculumWithRelations } from './page';
import { CURRICULUM_BOOK_ROLES, type CurriculumBookRoleValue } from '@/lib/validation/curriculumSchemas';

const FormModal = ({
  isOpen,
  onClose,
  title,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-xl font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
};

const Button = ({
  onClick,
  children,
  variant = 'primary',
  disabled,
  type,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'outline' }) => {
  const baseStyle = 'rounded px-4 py-2 text-sm font-semibold disabled:opacity-50';
  const variants: Record<string, string> = {
    primary: 'bg-blue-500 text-white hover:bg-blue-600',
    secondary: 'bg-gray-200 text-gray-700 hover:bg-gray-300',
    danger: 'bg-red-500 text-white hover:bg-red-600',
    outline: 'border border-gray-300 text-gray-700 hover:bg-gray-100',
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${baseStyle} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
};

function newDraftId() {
  return `draft-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())}`;
}

type DraftBook = {
  id: string;
  title: string;
  role: CurriculumBookRoleValue;
  authors: string;
  isbn: string;
  publisher: string;
  edition: string;
  notes: string;
};

function emptyDraft(): DraftBook {
  return {
    id: newDraftId(),
    title: '',
    role: 'primary',
    authors: '',
    isbn: '',
    publisher: '',
    edition: '',
    notes: '',
  };
}

type AcademicYearOption = Pick<AcademicYear, 'id' | 'name' | 'startDate' | 'endDate' | 'isArchived'>;

interface CurriculumClientProps {
  schoolId: string;
  academicYearId: string;
  initialAcademicYear: AcademicYear;
  initialCurriculumEntries: CurriculumWithRelations[];
  gradesForSchool: Grade[];
  subjectsForSchool: Subject[];
  initialAcademicYears: AcademicYearOption[];
}

export default function CurriculumClient({
  schoolId,
  academicYearId,
  initialAcademicYear: _initialAcademicYear,
  initialCurriculumEntries,
  gradesForSchool,
  subjectsForSchool,
  initialAcademicYears,
}: CurriculumClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [curriculumEntries, setCurriculumEntries] = useState<CurriculumWithRelations[]>(initialCurriculumEntries);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [currentCurriculumEntry, setCurrentCurriculumEntry] = useState<CurriculumWithRelations | null>(null);

  const [selectedGradeId, setSelectedGradeId] = useState<string>('');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [textbook, setTextbook] = useState<string>('');
  const [syllabusOutline, setSyllabusOutline] = useState<string>('');
  const [syllabusUrl, setSyllabusUrl] = useState<string>('');
  const [coefficient, setCoefficient] = useState<number>(1.0);
  const [periodsPerWeek, setPeriodsPerWeek] = useState<string>('');

  const [draftBooks, setDraftBooks] = useState<DraftBook[]>([]);

  const [copySourceYearId, setCopySourceYearId] = useState<string>('');
  const [copyPreview, setCopyPreview] = useState<{
    willCreateCount: number;
    skippedCount: number;
    toCreate: Array<{ gradeLevel: string; subjectName: string; bookCount: number }>;
    skipped: Array<{ gradeLevel: string; subjectName: string }>;
  } | null>(null);

  const [editingBookId, setEditingBookId] = useState<string | null>(null);
  const emptyBookFields = () => ({
    title: '',
    role: 'primary' as CurriculumBookRoleValue,
    authors: '',
    isbn: '',
    publisher: '',
    edition: '',
    notes: '',
  });
  const [newBook, setNewBook] = useState(emptyBookFields);
  const [editBook, setEditBook] = useState(emptyBookFields);

  useEffect(() => {
    setCurriculumEntries(initialCurriculumEntries);
  }, [initialCurriculumEntries]);

  const openModal = (mode: 'create' | 'edit', entry: CurriculumWithRelations | null = null) => {
    setModalMode(mode);
    setDraftBooks([]);
    setEditingBookId(null);
    setNewBook(emptyBookFields());
    setEditBook(emptyBookFields());
    if (mode === 'edit' && entry) {
      setCurrentCurriculumEntry(entry);
      setSelectedGradeId(String(entry.gradeId));
      setSelectedSubjectId(String(entry.subjectId));
      setDescription(entry.description || '');
      setTextbook(entry.textbook || '');
      setSyllabusOutline(entry.syllabusOutline || '');
      setSyllabusUrl(entry.syllabusUrl || '');
      setCoefficient(entry.coefficient ?? 1.0);
      setPeriodsPerWeek(entry.periodsPerWeek != null ? String(entry.periodsPerWeek) : '');
    } else {
      setCurrentCurriculumEntry(null);
      setSelectedGradeId(gradesForSchool[0]?.id ? String(gradesForSchool[0].id) : '');
      setSelectedSubjectId(subjectsForSchool[0]?.id ? String(subjectsForSchool[0].id) : '');
      setDescription('');
      setTextbook('');
      setSyllabusOutline('');
      setSyllabusUrl('');
      setCoefficient(1.0);
      setPeriodsPerWeek('');
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setCurrentCurriculumEntry(null);
    setEditingBookId(null);
  };

  const updateDraft = (id: string, patch: Partial<DraftBook>) => {
    setDraftBooks((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeDraft = (id: string) => {
    setDraftBooks((rows) => rows.filter((r) => r.id !== id));
  };

  const addDraftRow = () => {
    setDraftBooks((rows) => [...rows, emptyDraft()]);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (modalMode === 'create' && (!selectedGradeId || !selectedSubjectId)) {
      toast.error('Please select a grade and a subject.');
      return;
    }

    const initialBooks =
      modalMode === 'create'
        ? draftBooks
            .filter((d) => d.title.trim())
            .map((d) => ({
              title: d.title.trim(),
              role: d.role,
              authors: d.authors.trim() || null,
              isbn: d.isbn.trim() || null,
              publisher: d.publisher.trim() || null,
              edition: d.edition.trim() || null,
              notes: d.notes.trim() || null,
            }))
        : undefined;

    const rawPeriods = periodsPerWeek.trim();
    const parsedPeriods = rawPeriods === '' ? null : Number.parseInt(periodsPerWeek, 10);
    const periodsValue = rawPeriods === '' || Number.isNaN(parsedPeriods) ? null : parsedPeriods;

    const editPayload: Parameters<typeof updateCurriculumAction>[1] = {
      description,
      syllabusOutline: syllabusOutline || null,
      syllabusUrl: syllabusUrl.trim() || null,
      coefficient,
      periodsPerWeek: periodsValue,
    };

    if (modalMode === 'edit' && currentCurriculumEntry) {
      const hadLegacy = Boolean(currentCurriculumEntry.textbook?.trim());
      if (hadLegacy) {
        const orig = (currentCurriculumEntry.textbook ?? '').trim();
        const cur = textbook.trim();
        if (cur !== '' && cur !== orig) {
          toast.error(
            'You cannot change the legacy textbook text. Add materials under Books, then clear the legacy field.'
          );
          return;
        }
        if (cur === '') {
          editPayload.textbook = null;
        }
      }
    }

    startTransition(async () => {
      try {
        if (modalMode === 'create') {
          const result = await createCurriculumAction({
            schoolId,
            academicYearId,
            gradeId: selectedGradeId,
            subjectId: selectedSubjectId,
            description,
            syllabusOutline: syllabusOutline || null,
            syllabusUrl: syllabusUrl.trim() || null,
            coefficient,
            periodsPerWeek: periodsValue,
            initialBooks: initialBooks && initialBooks.length > 0 ? initialBooks : undefined,
          });
          if (result.success) {
            toast.success(result.message || 'Curriculum entry created!');
          } else {
            toast.error(result.message || 'Failed to create curriculum entry.');
            return;
          }
        } else if (currentCurriculumEntry) {
          const result = await updateCurriculumAction(currentCurriculumEntry.id, editPayload);
          if (result.success) {
            toast.success(result.message || 'Curriculum entry updated!');
          } else {
            toast.error(result.message || 'Failed to update curriculum entry.');
            return;
          }
        }
        closeModal();
        router.refresh();
      } catch (error: unknown) {
        toast.error(error instanceof Error ? error.message : 'Failed to save curriculum entry.');
      }
    });
  };

  const sourceYearOptions = initialAcademicYears.filter((y) => y.id !== academicYearId);

  const handleCopyPreview = () => {
    if (!copySourceYearId) {
      toast.error('Select a source academic year.');
      return;
    }
    startTransition(async () => {
      const result = await previewCopyCurriculumFromYearAction({
        schoolId,
        sourceAcademicYearId: copySourceYearId,
        targetAcademicYearId: academicYearId,
      });
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      setCopyPreview({
        willCreateCount: result.willCreateCount,
        skippedCount: result.skippedCount,
        toCreate: result.toCreate.map((r) => ({
          gradeLevel: r.gradeLevel,
          subjectName: r.subjectName,
          bookCount: r.bookCount,
        })),
        skipped: result.skipped.map((r) => ({
          gradeLevel: r.gradeLevel,
          subjectName: r.subjectName,
        })),
      });
      toast.success(
        `Preview: ${result.willCreateCount} to add, ${result.skippedCount} skipped (already in this year).`
      );
    });
  };

  const handleCopyApply = () => {
    if (!copySourceYearId) {
      toast.error('Select a source academic year.');
      return;
    }
    if (!copyPreview || copyPreview.willCreateCount === 0) {
      toast.error('Nothing to copy. Run preview first or choose a year with new rows.');
      return;
    }
    if (
      !window.confirm(
        `Copy ${copyPreview.willCreateCount} curriculum row(s) (including books) into this academic year?`
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await applyCopyCurriculumFromYearAction({
        schoolId,
        sourceAcademicYearId: copySourceYearId,
        targetAcademicYearId: academicYearId,
      });
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setCopyPreview(null);
      router.refresh();
    });
  };

  const handleDelete = async (curriculumId: string) => {
    if (!window.confirm('Are you sure you want to delete this curriculum entry? This action cannot be undone.')) return;

    startTransition(async () => {
      try {
        const result = await deleteCurriculumAction({ curriculumId, schoolId, academicYearId });
        if (result.success) {
          toast.success(result.message || 'Curriculum entry deleted!');
        } else {
          toast.error(result.message || 'Failed to delete curriculum entry.');
          return;
        }
        router.refresh();
      } catch (error: unknown) {
        toast.error(error instanceof Error ? error.message : 'Failed to delete curriculum entry.');
      }
    });
  };

  const startEditBook = (book: CurriculumBook) => {
    setEditingBookId(book.id);
    setEditBook({
      title: book.title,
      role: book.role as CurriculumBookRoleValue,
      authors: book.authors || '',
      isbn: book.isbn || '',
      publisher: book.publisher || '',
      edition: book.edition || '',
      notes: book.notes || '',
    });
  };

  const cancelEditBook = () => {
    setEditingBookId(null);
  };

  const saveEditedBook = (bookId: string) => {
    if (!editBook.title.trim()) {
      toast.error('Title is required.');
      return;
    }
    startTransition(async () => {
      const result = await updateCurriculumBookAction({
        bookId,
        schoolId,
        academicYearId,
        title: editBook.title.trim(),
        role: editBook.role,
        authors: editBook.authors.trim() || null,
        isbn: editBook.isbn.trim() || null,
        publisher: editBook.publisher.trim() || null,
        edition: editBook.edition.trim() || null,
        notes: editBook.notes.trim() || null,
      });
      if (result.success) {
        toast.success(result.message || 'Book updated.');
        setEditingBookId(null);
        router.refresh();
      } else {
        toast.error(result.message || 'Failed to update book.');
      }
    });
  };

  const handleDeleteBook = (bookId: string) => {
    if (!window.confirm('Remove this book from the curriculum?')) return;
    startTransition(async () => {
      const result = await deleteCurriculumBookAction({ bookId, schoolId, academicYearId });
      if (result.success) {
        toast.success(result.message || 'Book removed.');
        if (editingBookId === bookId) setEditingBookId(null);
        router.refresh();
      } else {
        toast.error(result.message || 'Failed to delete book.');
      }
    });
  };

  const handleAddBook = () => {
    if (!currentCurriculumEntry) return;
    if (!newBook.title.trim()) {
      toast.error('Title is required.');
      return;
    }
    startTransition(async () => {
      const result = await createCurriculumBookAction({
        curriculumId: currentCurriculumEntry.id,
        schoolId,
        academicYearId,
        title: newBook.title.trim(),
        role: newBook.role,
        authors: newBook.authors.trim() || null,
        isbn: newBook.isbn.trim() || null,
        publisher: newBook.publisher.trim() || null,
        edition: newBook.edition.trim() || null,
        notes: newBook.notes.trim() || null,
      });
      if (result.success) {
        toast.success(result.message || 'Book added.');
        setNewBook(emptyBookFields());
        router.refresh();
      } else {
        toast.error(result.message || 'Failed to add book.');
      }
    });
  };

  const primaryTitle = (books: CurriculumBook[]) => {
    const primary = books.find((b) => b.role === 'primary');
    return primary?.title ?? books[0]?.title;
  };

  const hasSyllabus = (entry: CurriculumWithRelations) =>
    Boolean((entry.syllabusOutline && entry.syllabusOutline.trim()) || (entry.syllabusUrl && entry.syllabusUrl.trim()));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button onClick={() => openModal('create')} variant="primary" disabled={isPending}>
          Add Curriculum Entry
        </Button>
      </div>

      <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h3 className="text-sm font-semibold text-gray-800">Copy from another academic year</h3>
        <p className="mt-1 text-xs text-gray-600">
          Copies grade × subject offerings (description, syllabus, books, coefficient, periods/week) into{' '}
          <strong>this</strong> year. Rows that already exist here are skipped. Legacy single-line textbook strings are
          copied only if still present on the source row (prefer Books).
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="copySourceYear" className="block text-xs font-medium text-gray-700">
              Source year
            </label>
            <select
              id="copySourceYear"
              value={copySourceYearId}
              onChange={(e) => {
                setCopySourceYearId(e.target.value);
                setCopyPreview(null);
              }}
              className="mt-1 block min-w-[12rem] rounded-md border border-gray-300 py-2 pl-3 pr-8 text-sm"
              disabled={isPending || sourceYearOptions.length === 0}
            >
              <option value="">Select year…</option>
              {sourceYearOptions.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                  {y.isArchived ? ' (archived)' : ''}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" variant="secondary" onClick={handleCopyPreview} disabled={isPending || !copySourceYearId}>
            Preview
          </Button>
          <Button type="button" variant="primary" onClick={handleCopyApply} disabled={isPending || !copyPreview || copyPreview.willCreateCount === 0}>
            Apply copy
          </Button>
        </div>
        {copyPreview && (
          <div className="mt-4 grid gap-4 text-sm md:grid-cols-2">
            <div>
              <p className="font-medium text-gray-800">Will import ({copyPreview.willCreateCount})</p>
              <ul className="mt-1 max-h-40 list-inside list-disc overflow-y-auto text-gray-600">
                {copyPreview.toCreate.length === 0 ? (
                  <li className="list-none text-gray-500">None</li>
                ) : (
                  copyPreview.toCreate.map((r, i) => (
                    <li key={`a-${i}`}>
                      {r.gradeLevel} · {r.subjectName}
                      {r.bookCount > 0 ? ` (${r.bookCount} books)` : ''}
                    </li>
                  ))
                )}
              </ul>
            </div>
            <div>
              <p className="font-medium text-gray-800">Skipped — duplicate ({copyPreview.skippedCount})</p>
              <ul className="mt-1 max-h-40 list-inside list-disc overflow-y-auto text-gray-600">
                {copyPreview.skipped.length === 0 ? (
                  <li className="list-none text-gray-500">None</li>
                ) : (
                  copyPreview.skipped.map((r, i) => (
                    <li key={`s-${i}`}>
                      {r.gradeLevel} · {r.subjectName}
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        )}
      </div>

      <div className="overflow-hidden bg-white shadow sm:rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Grade</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Subject</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Coefficient</th>
              <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500" title="Weekly periods (timetable)">
                Periods/wk
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Description</th>
              <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500" title="Syllabus outline or link">
                Syllabus
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Books</th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {isPending && curriculumEntries.length === 0 && (
              <tr>
                <td colSpan={8} className="p-4 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            )}
            {!isPending && curriculumEntries.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-4 text-center text-sm text-gray-500">
                  No curriculum entries found for this academic year.
                </td>
              </tr>
            )}
            {curriculumEntries.map((entry) => {
              const books = entry.books ?? [];
              const pTitle = primaryTitle(books);
              return (
                <tr key={entry.id}>
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">{entry.grade.level}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{entry.subject.name}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{entry.coefficient ?? 1.0}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-center text-sm text-gray-500">
                    {entry.periodsPerWeek != null ? entry.periodsPerWeek : '—'}
                  </td>
                  <td className="max-w-xs truncate px-6 py-4 text-sm text-gray-500">{entry.description}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-center text-gray-600">
                    {hasSyllabus(entry) ? (
                      <span title="Has syllabus outline or link">
                        <FileText className="inline h-5 w-5 text-indigo-600" aria-hidden />
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="max-w-[14rem] px-6 py-4 text-sm text-gray-500">
                    <span className="font-medium text-gray-700">{books.length}</span>
                    {pTitle ? <span className="ml-2 truncate text-gray-500">· {pTitle}</span> : null}
                    {entry.textbook?.trim() ? (
                      <span className="ml-1 block truncate text-xs text-amber-800" title="Legacy textbook field — open Edit to clear">
                        Legacy text on file
                      </span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                    <span className="space-x-2">
                      <Button onClick={() => openModal('edit', entry)} variant="outline" disabled={isPending}>
                        Edit
                      </Button>
                      <Button onClick={() => handleDelete(entry.id)} variant="danger" disabled={isPending}>
                        Delete
                      </Button>
                    </span>
                  </td>
                </tr>
              );
            })}
            {curriculumEntries.length > 0 && (
              <tr className="bg-gray-50 font-semibold">
                <td className="px-6 py-3 text-sm text-gray-700" colSpan={2}>
                  Total Coefficients
                </td>
                <td className="px-6 py-3 text-sm text-gray-700">
                  {curriculumEntries.reduce((sum, e) => sum + (e.coefficient ?? 1.0), 0).toFixed(1)}
                </td>
                <td className="px-6 py-3 text-sm text-gray-400">—</td>
                <td colSpan={4}></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <FormModal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={modalMode === 'create' ? 'Add Curriculum Entry' : 'Edit Curriculum Entry'}
      >
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
            <div>
              <label htmlFor="gradeId" className="block text-sm font-medium text-gray-700">
                Grade
              </label>
              <select
                id="gradeId"
                name="gradeId"
                value={selectedGradeId}
                onChange={(e) => setSelectedGradeId(e.target.value)}
                disabled={isPending || modalMode === 'edit'}
                className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 disabled:bg-gray-100 sm:text-sm"
                required={modalMode === 'create'}
              >
                <option value="" disabled={modalMode === 'create'}>
                  Select a grade
                </option>
                {gradesForSchool.map((grade) => (
                  <option key={grade.id} value={String(grade.id)}>
                    {grade.level}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="subjectId" className="block text-sm font-medium text-gray-700">
                Subject
              </label>
              <select
                id="subjectId"
                name="subjectId"
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
                disabled={isPending || modalMode === 'edit'}
                className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 disabled:bg-gray-100 sm:text-sm"
                required={modalMode === 'create'}
              >
                <option value="" disabled={modalMode === 'create'}>
                  Select a subject
                </option>
                {subjectsForSchool.map((subject) => (
                  <option key={subject.id} value={String(subject.id)}>
                    {subject.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4">
            <label htmlFor="description" className="block text-sm font-medium text-gray-700">
              Description (optional)
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isPending}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm"
            />
          </div>

          <div className="mt-4">
            <label htmlFor="syllabusOutline" className="block text-sm font-medium text-gray-700">
              Syllabus outline (optional)
            </label>
            <p className="mt-0.5 text-xs text-gray-500">Units, chapters, or pacing notes (plain text or Markdown).</p>
            <textarea
              id="syllabusOutline"
              name="syllabusOutline"
              rows={4}
              value={syllabusOutline}
              onChange={(e) => setSyllabusOutline(e.target.value)}
              disabled={isPending}
              className="mt-1 block w-full rounded-md border-gray-300 font-mono text-sm shadow-sm"
              placeholder="e.g. Term 1: Algebra basics; Term 2: Geometry…"
            />
          </div>

          <div className="mt-4">
            <label htmlFor="syllabusUrl" className="block text-sm font-medium text-gray-700">
              Syllabus URL (optional)
            </label>
            <input
              type="url"
              id="syllabusUrl"
              name="syllabusUrl"
              value={syllabusUrl}
              onChange={(e) => setSyllabusUrl(e.target.value)}
              disabled={isPending}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm"
              placeholder="https://…"
            />
          </div>

          {modalMode === 'edit' && currentCurriculumEntry?.textbook?.trim() ? (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              <p className="font-medium">Legacy textbook field</p>
              <p className="mt-1 text-xs text-amber-900/90">
                This school still has a free-text value from before structured books. Add the same (or updated) title under{' '}
                <strong>Books</strong> below, then clear this field. New entries use Books only.
              </p>
              <p className="mt-2 rounded border border-amber-100 bg-white px-2 py-1.5 font-mono text-xs text-gray-800">
                {currentCurriculumEntry.textbook}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="text-xs"
                  disabled={isPending}
                  onClick={() => setTextbook('')}
                >
                  Clear legacy field (save to apply)
                </Button>
                {textbook.trim() === '' && (
                  <span className="text-xs text-amber-800">Unsaved: legacy will be removed when you save.</span>
                )}
              </div>
            </div>
          ) : null}

          <div className="mt-4">
            <label htmlFor="coefficient" className="block text-sm font-medium text-gray-700">
              Coefficient
            </label>
            <input
              type="number"
              id="coefficient"
              name="coefficient"
              value={coefficient}
              onChange={(e) => setCoefficient(parseFloat(e.target.value) || 1.0)}
              min="0.1"
              step="0.1"
              disabled={isPending}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm"
            />
            <p className="mt-1 text-xs text-gray-400">How much this subject counts toward the overall average (default: 1.0)</p>
          </div>

          <div className="mt-4">
            <label htmlFor="periodsPerWeek" className="block text-sm font-medium text-gray-700">
              Periods per week (optional)
            </label>
            <input
              type="number"
              id="periodsPerWeek"
              name="periodsPerWeek"
              value={periodsPerWeek}
              onChange={(e) => setPeriodsPerWeek(e.target.value)}
              min={0}
              max={60}
              step={1}
              placeholder="e.g. 4"
              disabled={isPending}
              className="mt-1 block w-full max-w-xs rounded-md border-gray-300 shadow-sm sm:text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">
              Used to plan weekly timetable load for this grade × subject. Leave empty if not set.
            </p>
          </div>

          {modalMode === 'create' && (
            <div className="mt-6 border-t border-gray-200 pt-4">
              <h3 className="text-sm font-semibold text-gray-800">Books (optional)</h3>
              <p className="mt-1 text-xs text-gray-500">Add one or more resources before saving; they are stored with this curriculum row.</p>
              {draftBooks.map((row) => (
                <div key={row.id} className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className="text-xs font-medium text-gray-600">Title</label>
                      <input
                        value={row.title}
                        onChange={(e) => updateDraft(row.id, { title: e.target.value })}
                        className="mt-0.5 block w-full rounded border border-gray-300 text-sm"
                        disabled={isPending}
                        placeholder="Book title"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600">Role</label>
                      <select
                        value={row.role}
                        onChange={(e) => updateDraft(row.id, { role: e.target.value as CurriculumBookRoleValue })}
                        className="mt-0.5 block w-full rounded border border-gray-300 text-sm"
                        disabled={isPending}
                      >
                        {CURRICULUM_BOOK_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600">Authors (optional)</label>
                      <input
                        value={row.authors}
                        onChange={(e) => updateDraft(row.id, { authors: e.target.value })}
                        className="mt-0.5 block w-full rounded border border-gray-300 text-sm"
                        disabled={isPending}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600">ISBN (optional)</label>
                      <input
                        value={row.isbn}
                        onChange={(e) => updateDraft(row.id, { isbn: e.target.value })}
                        className="mt-0.5 block w-full rounded border border-gray-300 text-sm"
                        disabled={isPending}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600">Publisher (optional)</label>
                      <input
                        value={row.publisher}
                        onChange={(e) => updateDraft(row.id, { publisher: e.target.value })}
                        className="mt-0.5 block w-full rounded border border-gray-300 text-sm"
                        disabled={isPending}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600">Edition (optional)</label>
                      <input
                        value={row.edition}
                        onChange={(e) => updateDraft(row.id, { edition: e.target.value })}
                        className="mt-0.5 block w-full rounded border border-gray-300 text-sm"
                        disabled={isPending}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs font-medium text-gray-600">Notes (optional)</label>
                      <textarea
                        value={row.notes}
                        onChange={(e) => updateDraft(row.id, { notes: e.target.value })}
                        rows={2}
                        className="mt-0.5 block w-full rounded border border-gray-300 text-sm"
                        disabled={isPending}
                      />
                    </div>
                  </div>
                  <Button type="button" variant="outline" className="mt-2" onClick={() => removeDraft(row.id)} disabled={isPending}>
                    Remove
                  </Button>
                </div>
              ))}
              <Button type="button" variant="secondary" className="mt-2" onClick={addDraftRow} disabled={isPending}>
                + Add book
              </Button>
            </div>
          )}

          {modalMode === 'edit' && currentCurriculumEntry && (
            <div className="mt-6 border-t border-gray-200 pt-4">
              <h3 className="text-sm font-semibold text-gray-800">Books</h3>
              <ul className="mt-2 space-y-2">
                {(currentCurriculumEntry.books ?? []).map((book) => (
                  <li key={book.id} className="rounded-md border border-gray-200 p-3">
                    {editingBookId === book.id ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <label className="text-xs font-medium text-gray-600">Title</label>
                          <input
                            value={editBook.title}
                            onChange={(e) => setEditBook((f) => ({ ...f, title: e.target.value }))}
                            className="mt-0.5 block w-full rounded border border-gray-300 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-600">Role</label>
                          <select
                            value={editBook.role}
                            onChange={(e) => setEditBook((f) => ({ ...f, role: e.target.value as CurriculumBookRoleValue }))}
                            className="mt-0.5 block w-full rounded border border-gray-300 text-sm"
                          >
                            {CURRICULUM_BOOK_ROLES.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex gap-2 sm:col-span-2">
                          <Button type="button" variant="primary" onClick={() => saveEditedBook(book.id)} disabled={isPending}>
                            Save
                          </Button>
                          <Button type="button" variant="secondary" onClick={cancelEditBook} disabled={isPending}>
                            Cancel
                          </Button>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-600">Authors</label>
                          <input
                            value={editBook.authors}
                            onChange={(e) => setEditBook((f) => ({ ...f, authors: e.target.value }))}
                            className="mt-0.5 block w-full rounded border border-gray-300 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-600">ISBN</label>
                          <input
                            value={editBook.isbn}
                            onChange={(e) => setEditBook((f) => ({ ...f, isbn: e.target.value }))}
                            className="mt-0.5 block w-full rounded border border-gray-300 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-600">Publisher</label>
                          <input
                            value={editBook.publisher}
                            onChange={(e) => setEditBook((f) => ({ ...f, publisher: e.target.value }))}
                            className="mt-0.5 block w-full rounded border border-gray-300 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-600">Edition</label>
                          <input
                            value={editBook.edition}
                            onChange={(e) => setEditBook((f) => ({ ...f, edition: e.target.value }))}
                            className="mt-0.5 block w-full rounded border border-gray-300 text-sm"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-xs font-medium text-gray-600">Notes</label>
                          <textarea
                            value={editBook.notes}
                            onChange={(e) => setEditBook((f) => ({ ...f, notes: e.target.value }))}
                            rows={2}
                            className="mt-0.5 block w-full rounded border border-gray-300 text-sm"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-gray-900">{book.title}</p>
                          <p className="text-xs text-gray-500">
                            {book.role}
                            {book.authors ? ` · ${book.authors}` : ''}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button type="button" variant="outline" onClick={() => startEditBook(book)} disabled={isPending}>
                            Edit
                          </Button>
                          <Button type="button" variant="danger" onClick={() => handleDeleteBook(book.id)} disabled={isPending}>
                            Remove
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>

              {editingBookId === null && (
                <div className="mt-4 rounded-md border border-dashed border-gray-300 p-3">
                  <p className="text-xs font-medium text-gray-700">Add a book</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <input
                        value={newBook.title}
                        onChange={(e) => setNewBook((f) => ({ ...f, title: e.target.value }))}
                        className="block w-full rounded border border-gray-300 text-sm"
                        placeholder="Title"
                      />
                    </div>
                    <div>
                      <select
                        value={newBook.role}
                        onChange={(e) => setNewBook((f) => ({ ...f, role: e.target.value as CurriculumBookRoleValue }))}
                        className="block w-full rounded border border-gray-300 text-sm"
                      >
                        {CURRICULUM_BOOK_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-end">
                      <Button type="button" variant="primary" onClick={handleAddBook} disabled={isPending}>
                        Add book
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-6 flex justify-end space-x-2">
            <Button type="button" onClick={closeModal} variant="secondary" disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isPending}>
              {isPending ? (modalMode === 'create' ? 'Adding…' : 'Saving…') : modalMode === 'create' ? 'Add entry' : 'Save changes'}
            </Button>
          </div>
        </form>
      </FormModal>
    </div>
  );
}
