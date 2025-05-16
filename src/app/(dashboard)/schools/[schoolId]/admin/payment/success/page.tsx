import Link from 'next/link';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

type SuccessPageProps = {
  params: {
    schoolId: string;
  };
};

export default function PaymentSuccessPage({ params }: SuccessPageProps) {
  const { schoolId } = params;

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)] text-center">
      <CheckCircleIcon className="w-16 h-16 text-green-500 mb-4" />
      <h1 className="text-2xl font-semibold text-gray-800 mb-2">Payment Successful!</h1>
      <p className="text-gray-600 mb-6">
        Your subscription has been processed successfully.
      </p>
      <Link
        href={`/schools/${schoolId}/admin/subscription`}
        className="px-6 py-2 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
      >
        Go to Subscription Page
      </Link>
    </div>
  );
} 