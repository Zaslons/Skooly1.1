"use client";

import { useState, useTransition } from 'react';
import { PopulatedScheduleChangeRequest } from "./page";
import { AuthUser } from "@/lib/auth";
import { Day, RequestStatus, ScheduleChangeType } from "@prisma/client";
import { formatDateTimeToTimeString, cn } from "@/lib/utils";
import { cancelScheduleChangeRequest } from "@/lib/actions";
import { toast } from "react-toastify";
import { useRouter } from "next/navigation";
import { AlertOctagon, CheckCircle2, Clock, HelpCircle, MinusCircle, XCircle, Loader2 } from "lucide-react";

interface MyRequestsClientProps {
  initialRequests: PopulatedScheduleChangeRequest[];
  authUser: AuthUser;
  schoolId: string;
}

const getStatusStyles = (status: RequestStatus) => {
  switch (status) {
    case RequestStatus.PENDING:
      return { icon: <Clock className="h-4 w-4 text-yellow-500" />, bgColor: "bg-yellow-50", textColor: "text-yellow-700", borderColor: "border-yellow-300" };
    case RequestStatus.APPROVED:
      return { icon: <CheckCircle2 className="h-4 w-4 text-green-500" />, bgColor: "bg-green-50", textColor: "text-green-700", borderColor: "border-green-300" };
    case RequestStatus.REJECTED:
      return { icon: <XCircle className="h-4 w-4 text-red-500" />, bgColor: "bg-red-50", textColor: "text-red-700", borderColor: "border-red-300" };
    case RequestStatus.CANCELED:
      return { icon: <MinusCircle className="h-4 w-4 text-gray-500" />, bgColor: "bg-gray-50", textColor: "text-gray-700", borderColor: "border-gray-300" };
    default:
      return { icon: <HelpCircle className="h-4 w-4 text-gray-500" />, bgColor: "bg-gray-50", textColor: "text-gray-700", borderColor: "border-gray-300" };
  }
};

const MyRequestsClient = ({
  initialRequests,
  authUser,
  schoolId,
}: MyRequestsClientProps) => {
  const router = useRouter();
  const [requests, setRequests] = useState(initialRequests);
  const [isCanceling, startCancelTransition] = useTransition();

  const handleCancelRequest = async (requestId: string) => {
    startCancelTransition(async () => {
      try {
        const result = await cancelScheduleChangeRequest({ success: false, error: false }, requestId);
        if (result.success) {
          toast.success(result.message || "Request canceled successfully.");
          setRequests(prevRequests => 
            prevRequests.map(req => 
              req.id === requestId ? { ...req, status: RequestStatus.CANCELED } : req
            )
          );
          router.refresh(); 
        } else {
          toast.error(result.message || "Failed to cancel request.");
        }
      } catch (error) {
        console.error("Error canceling request:", error);
        toast.error("An unexpected error occurred while canceling the request.");
      }
    });
  };

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-2xl font-semibold text-gray-800 mb-6">My Schedule Change Requests</h1>

      {requests.length === 0 && (
        <div className="text-center py-10 bg-white rounded-lg shadow">
          <AlertOctagon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No Requests Found</h3>
          <p className="mt-1 text-sm text-gray-500">You haven't submitted any schedule change requests yet.</p>
        </div>
      )}

      <div className="space-y-4">
        {requests.map((request) => {
          const statusInfo = getStatusStyles(request.status);
          return (
            <div key={request.id} className={cn("bg-white p-4 rounded-lg shadow border-l-4", statusInfo.borderColor)}>
              <div className="flex flex-col sm:flex-row justify-between sm:items-start">
                <div>
                    <div className="flex items-center mb-1">
                        {statusInfo.icon}
                        <span className={cn("ml-2 text-sm font-semibold", statusInfo.textColor)}>
                            Status: {request.status.charAt(0) + request.status.slice(1).toLowerCase()}
                        </span>
                    </div>
                  <h3 className="text-md font-semibold text-gray-700">
                    Request for Lesson: <span className="text-indigo-600">{request.lesson.name}</span>
                  </h3>
                  <p className="text-xs text-gray-500">
                    Original: {request.lesson.day}, {formatDateTimeToTimeString(new Date(request.lesson.startTime))} - {formatDateTimeToTimeString(new Date(request.lesson.endTime))}
                  </p>
                  <p className="text-xs text-gray-500">Subject: {request.lesson.subject.name} | Class: {request.lesson.class.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Submitted: {new Date(request.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="mt-3 sm:mt-0 sm:ml-4 flex-shrink-0">
                  {request.status === RequestStatus.PENDING && (
                    <button
                      type="button"
                      onClick={() => handleCancelRequest(request.id)}
                      disabled={isCanceling}
                      className={cn(
                        "text-xs font-medium py-1 px-2 rounded-md flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-offset-1",
                        isCanceling
                          ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                          : "border border-red-500 text-red-500 hover:bg-red-50 focus:ring-red-400"
                      )}
                    >
                      {isCanceling ? (
                        <>
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          Canceling...
                        </>
                      ) : (
                        <>
                          <XCircle className="mr-1 h-3 w-3" />
                          Cancel Request
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-xs text-gray-600 font-medium mb-1">Details:</p>
                <p className="text-xs text-gray-500">
                    <span className="font-semibold">Type:</span> {request.requestedChangeType === ScheduleChangeType.TIME_CHANGE ? "Time/Day Change" : "Teacher Swap"}
                </p>
                {request.requestedChangeType === ScheduleChangeType.TIME_CHANGE && (
                  <>
                    <p className="text-xs text-gray-500">
                        <span className="font-semibold">Proposed Day:</span> {request.proposedDay}
                    </p>
                    <p className="text-xs text-gray-500">
                        <span className="font-semibold">Proposed Time:</span> {request.proposedStartTime ? formatDateTimeToTimeString(new Date(request.proposedStartTime)) : 'N/A'} - {request.proposedEndTime ? formatDateTimeToTimeString(new Date(request.proposedEndTime)) : 'N/A'}
                    </p>
                  </>
                )}
                {request.requestedChangeType === ScheduleChangeType.SWAP && request.proposedSwapTeacher && (
                  <p className="text-xs text-gray-500">
                    <span className="font-semibold">Proposed Swap With:</span> {request.proposedSwapTeacher.name} {request.proposedSwapTeacher.surname}
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                    <span className="font-semibold">Reason:</span> {request.reason}
                </p>
                {request.adminNotes && (
                     <p className="text-xs text-amber-700 mt-1 bg-amber-50 p-2 rounded-md">
                        <span className="font-semibold">Admin Notes:</span> {request.adminNotes}
                    </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MyRequestsClient; 