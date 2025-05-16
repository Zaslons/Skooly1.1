"use client";

import { useState, useTransition } from 'react';
import { PopulatedScheduleChangeRequestForAdmin } from "./page";
import { formatDateTimeToTimeString } from "@/lib/utils";
import { Day, ScheduleChangeType, RequestStatus } from '@prisma/client';
// import { Button } from '@/components/ui/button'; // Removed import
import { toast } from 'react-toastify';
import { CheckCircle, XCircle, MessageSquareText, Send, Loader2 } from 'lucide-react'; // Added icons
import { rejectScheduleChangeRequest, approveScheduleChangeRequest } from "@/lib/actions"; // Uncommented
// import { approveScheduleChangeRequest } from "@/lib/actions"; // We'll uncomment this later

interface AdminScheduleRequestsClientProps {
  initialRequests: PopulatedScheduleChangeRequestForAdmin[];
  schoolId: string;
}

const AdminScheduleRequestsClient = ({ initialRequests, schoolId }: AdminScheduleRequestsClientProps) => {
  const [requests, setRequests] = useState<PopulatedScheduleChangeRequestForAdmin[]>(initialRequests);
  const [isProcessing, startTransition] = useTransition(); // Renamed isPending to isProcessing for clarity
  const [selectedRequestForNotes, setSelectedRequestForNotes] = useState<PopulatedScheduleChangeRequestForAdmin | null>(null);
  const [rejectionNotes, setRejectionNotes] = useState("");

  const handleApprove = async (requestId: string) => {
    console.log("[CLIENT AdminScheduleRequests] Approve clicked for", requestId);
    startTransition(async () => {
      try {
        const result = await approveScheduleChangeRequest(
          { success: false, error: false }, // Initial currentState for the action
          requestId
        );
        if (result.success) {
          toast.success(result.message || "Request approved successfully!");
          setRequests(prev => prev.filter(r => r.id !== requestId));
        } else {
          toast.error(result.message || "Failed to approve request.");
        }
      } catch (error) {
        console.error("[CLIENT AdminScheduleRequests] Error during approve transition:", error);
        toast.error("An unexpected error occurred while approving the request.");
      }
    });
  };

  const handleReject = async (requestId: string) => {
    if (!rejectionNotes.trim()) {
      toast.error("Rejection notes are required.");
      return;
    }
    console.log("[CLIENT AdminScheduleRequests] Reject clicked for", requestId, "Notes:", rejectionNotes);
    startTransition(async () => {
      try {
        const result = await rejectScheduleChangeRequest(
          { success: false, error: false }, 
          { requestId, adminNotes: rejectionNotes.trim() }
        );
        if (result.success) {
          toast.success(result.message || "Request rejected successfully!");
          setRequests(prev => prev.filter(r => r.id !== requestId)); 
          setSelectedRequestForNotes(null);
          setRejectionNotes("");
        } else {
          toast.error(result.message || "Failed to reject request.");
        }
      } catch (error) {
        console.error("[CLIENT AdminScheduleRequests] Error during reject transition:", error);
        toast.error("An unexpected error occurred while rejecting the request.");
      }
    });
  };

  const openRejectModal = (request: PopulatedScheduleChangeRequestForAdmin) => {
    setSelectedRequestForNotes(request);
    setRejectionNotes(""); 
  };

  const renderProposedTime = (request: PopulatedScheduleChangeRequestForAdmin) => {
    if (request.requestedChangeType === ScheduleChangeType.TIME_CHANGE) {
      let proposedStartTimeStr = 'N/A';
      let proposedEndTimeStr = 'N/A';
      try {
        if (request.proposedStartTime) {
          // Check if it's a full ISO string or just HH:mm
          const dateObjStart = new Date(request.proposedStartTime);
          if (!isNaN(dateObjStart.getTime())) {
            proposedStartTimeStr = formatDateTimeToTimeString(dateObjStart);
          } else if (typeof request.proposedStartTime === 'string' && request.proposedStartTime.match(/^([01]\d|2[0-3]):([0-5]\d)$/)) {
             // Handle HH:mm string by creating a dummy date
            proposedStartTimeStr = formatDateTimeToTimeString(new Date(`1970-01-01T${request.proposedStartTime}`));
          }
        }
        if (request.proposedEndTime) {
          const dateObjEnd = new Date(request.proposedEndTime);
          if (!isNaN(dateObjEnd.getTime())) {
            proposedEndTimeStr = formatDateTimeToTimeString(dateObjEnd);
          } else if (typeof request.proposedEndTime === 'string' && request.proposedEndTime.match(/^([01]\d|2[0-3]):([0-5]\d)$/)){
            proposedEndTimeStr = formatDateTimeToTimeString(new Date(`1970-01-01T${request.proposedEndTime}`));
          }
        }
      } catch (e) {
        console.warn("Could not format proposed time for display", e);
      }

      return (
        <p className="text-sm">
          <span className="font-medium">New Time:</span> {request.proposedDay?.toString().toLowerCase() ?? 'N/A'}, 
          {proposedStartTimeStr} - {proposedEndTimeStr}
        </p>
      );
    }
    return null;
  };

  const renderProposedSwap = (request: PopulatedScheduleChangeRequestForAdmin) => {
    if (request.requestedChangeType === ScheduleChangeType.SWAP && request.proposedSwapTeacher) {
      return (
        <p className="text-sm">
          <span className="font-medium">Swap With:</span> {request.proposedSwapTeacher.name} {request.proposedSwapTeacher.surname} 
          ({request.proposedSwapTeacher.email || 'N/A'})
        </p>
      );
    }
    return null;
  };

  const pendingRequests = requests.filter(r => r.status === RequestStatus.PENDING);

  if (pendingRequests.length === 0) {
    return (
      <div className="p-6 text-center">
        <MessageSquareText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <p className="text-gray-500 text-lg">No pending schedule change requests.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-8 text-center">Pending Schedule Change Requests</h1>
        <div className="space-y-6">
          {pendingRequests.map((request) => (
            <div key={request.id} className="bg-white p-5 shadow-xl rounded-xl border border-gray-200 hover:shadow-2xl transition-shadow duration-300 ease-in-out">
              <div className="flex flex-col md:flex-row justify-between md:items-start mb-4">
                <div>
                  <h2 className="text-xl font-semibold text-indigo-700">
                    Lesson: {request.lesson.name} <span className="text-gray-600 text-base font-normal">(Class: {request.lesson.class.name})</span>
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    <span className="font-medium">Current Teacher:</span> {request.lesson.teacher.name} {request.lesson.teacher.surname}
                  </p>
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">Current Time:</span> {request.lesson.day.toString().toLowerCase()}, {formatDateTimeToTimeString(request.lesson.startTime)} - {formatDateTimeToTimeString(request.lesson.endTime)}
                  </p>
                   <p className="text-sm text-gray-600 font-semibold mt-1">
                    <span className="font-medium">Requested By:</span> {request.requestingTeacher.name} {request.requestingTeacher.surname} ({request.requestingTeacher.email || 'N/A'})
                  </p>
                </div>
                <div className="text-xs mt-2 md:mt-0 md:text-right text-gray-500">
                  Requested on: {new Date(request.createdAt).toLocaleDateString()} {new Date(request.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>

              <div className="bg-indigo-50 p-4 rounded-lg mb-4 space-y-2 border border-indigo-200">
                <h3 className="text-md font-semibold text-gray-800 mb-1">Change Details:</h3>
                <p className="text-sm capitalize text-gray-700">
                  <span className="font-medium">Type:</span> {request.requestedChangeType.replace('_', ' ').toLowerCase()}
                </p>
                {renderProposedTime(request)}
                {renderProposedSwap(request)}
                <p className="text-sm text-gray-700"><span className="font-medium">Reason:</span> {request.reason}</p>
              </div>
              
              {selectedRequestForNotes?.id === request.id ? (
                <div className="mt-4 mb-3 p-4 border border-gray-300 rounded-lg bg-gray-50">
                  <label htmlFor={`notes-${request.id}`} className="block text-sm font-medium text-gray-700 mb-1">Rejection Notes (Required):</label>
                  <textarea 
                    id={`notes-${request.id}`}
                    value={rejectionNotes}
                    onChange={(e) => setRejectionNotes(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm min-h-[80px]"
                    rows={3}
                    placeholder="Provide a clear reason for rejecting this request..."
                  />
                  <div className="mt-3 flex justify-end gap-3">
                      <button 
                        type="button"
                        onClick={() => setSelectedRequestForNotes(null)} 
                        disabled={isProcessing}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button 
                        type="button"
                        onClick={() => handleReject(request.id)}
                        disabled={isProcessing || !rejectionNotes.trim()}
                        className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                      >
                        {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />} Confirm Rejection
                      </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap gap-3 justify-end">
                  <button 
                    type="button"
                    onClick={() => openRejectModal(request)} 
                    disabled={isProcessing}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-500 border border-transparent rounded-md shadow-sm hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 flex items-center"
                  >
                    <XCircle className="mr-2 h-4 w-4" /> Reject
                  </button>
                  <button 
                    type="button"
                    onClick={() => handleApprove(request.id)} 
                    disabled={isProcessing}
                    className="px-4 py-2 text-sm font-medium text-white bg-green-500 border border-transparent rounded-md shadow-sm hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 flex items-center"
                  >
                    {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />} Approve
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminScheduleRequestsClient; 