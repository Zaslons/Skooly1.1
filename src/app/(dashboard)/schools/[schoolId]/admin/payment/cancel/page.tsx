import Link from 'next/link';
import { XCircleIcon } from '@heroicons/react/24/solid';

type CancelPageProps = {
  params: {
    schoolId: string;
  };
};

export default function PaymentCancelPage({ params }: CancelPageProps) {
  const { schoolId } = params;

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)] text-center">
      <XCircleIcon className="w-16 h-16 text-red-500 mb-4" />
      <h1 className="text-2xl font-semibold text-gray-800 mb-2">Payment Cancelled</h1>
      <p className="text-gray-600 mb-6">
        Your payment process was cancelled. You have not been charged.
      </p>
      <p className="text-gray-600 mb-6">
        If this was a mistake, you can try subscribing again. If you encountered an issue, please contact support.
      </p>
      <Link
        href={`/schools/${schoolId}/admin/subscription`}
        className="px-6 py-2 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 mr-2"
      >
        Back to Subscription Page
      </Link>
      <Link
        href={`/dashboard`}
        className="px-6 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400"
      >
        Go to Dashboard
      </Link>
    </div>
  );
} 