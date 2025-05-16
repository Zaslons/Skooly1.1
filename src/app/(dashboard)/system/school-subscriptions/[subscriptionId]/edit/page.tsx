'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { SchoolSubscription, SubscriptionPlan, School, SubscriptionStatus } from '@prisma/client';
import type { AuthUser } from '@/lib/auth';
import Link from 'next/link';

// Zod Schema for form validation
const EditSchoolSubscriptionSchema = z.object({
  status: z.nativeEnum(SubscriptionStatus),
  currentPeriodStart: z.string().refine(val => !isNaN(Date.parse(val)), { message: "Start date is required and must be a valid date." }),
  endDate: z.string().optional().nullable().refine(val => !val || !isNaN(Date.parse(val)), { message: "End date must be a valid date if provided." }),
  stripeSubscriptionId: z.string().optional().nullable(),
});

type EditSchoolSubscriptionFormValues = z.infer<typeof EditSchoolSubscriptionSchema>;

interface EnrichedSchoolSubscription extends SchoolSubscription {
  school: { id: string; name: string };
  subscriptionPlan: { id: string; name: string };
}

const EditSchoolSubscriptionPage = () => {
  const router = useRouter();
  const params = useParams();
  const subscriptionId = params.subscriptionId as string;

  const [subscription, setSubscription] = useState<EnrichedSchoolSubscription | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);


  const { register, handleSubmit, reset, formState: { errors } } = useForm<EditSchoolSubscriptionFormValues>({
    resolver: zodResolver(EditSchoolSubscriptionSchema),
  });

  useEffect(() => {
    const fetchInitialData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const authResponse = await fetch('/api/auth/me');
        if (!authResponse.ok) {
          if (authResponse.status === 401) router.push('/sign-in');
          throw new Error('Failed to fetch user data');
        }
        const user: AuthUser = await authResponse.json();
        setAuthUser(user);

        if (user.role !== 'system_admin') {
          setError('Access Denied. You do not have permission to view this page.');
          setIsLoading(false);
          return;
        }

        if (subscriptionId) {
          const subResponse = await fetch(`/api/system_admin/school-subscriptions/${subscriptionId}`);
          if (!subResponse.ok) {
            const errorData = await subResponse.json();
            throw new Error(errorData.error || 'Failed to fetch subscription details');
          }
          const subData: EnrichedSchoolSubscription = await subResponse.json();
          setSubscription(subData);
          reset({
            status: subData.status,
            currentPeriodStart: subData.currentPeriodStart ? new Date(subData.currentPeriodStart).toISOString().split('T')[0] : '',
            endDate: subData.endDate ? new Date(subData.endDate).toISOString().split('T')[0] : '',
            stripeSubscriptionId: subData.stripeSubscriptionId || '',
          });
        }
      } catch (err: any) {
        setError(err.message);
      }
      setIsLoading(false);
    };

    fetchInitialData();
  }, [subscriptionId, router, reset]);

  const onSubmit: SubmitHandler<EditSchoolSubscriptionFormValues> = async (data) => {
    if (!subscription) return;
    setIsSubmitting(true);
    setError(null);
    setSubmitSuccess(null);

    // Prepare data for API: Convert date strings to Date objects or ensure correct format
    const payload = {
        ...data,
        currentPeriodStart: new Date(data.currentPeriodStart).toISOString(),
        endDate: data.endDate ? new Date(data.endDate).toISOString() : null,
    };

    try {
      const response = await fetch(`/api/system_admin/school-subscriptions/${subscription.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update subscription');
      }
      setSubmitSuccess('Subscription updated successfully!');
      // Optionally refetch or update local state if needed, then redirect
      setTimeout(() => router.push('/system/school-subscriptions'), 2000);

    } catch (err: any) {
      setError(err.message);
    }
    setIsSubmitting(false);
  };

  if (isLoading) {
    return <div className="p-4 md:p-6">Loading subscription details...</div>;
  }

  if (error && (!authUser || authUser.role !== 'system_admin')) {
    return <div className="p-4 md:p-6 text-red-500">Error: {error}</div>;
  }

  if (!authUser || authUser.role !== 'system_admin') {
    return <div className="p-4 md:p-6 text-red-500">Access Denied.</div>;
  }

  if (!subscription) {
    return <div className="p-4 md:p-6 text-red-500">Subscription not found or error loading details. {error && `(${error})`}</div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">Edit School Subscription</h1>
        <Link href="/system/school-subscriptions" className="text-blue-600 hover:text-blue-800">
          &larr; Back to Subscriptions
        </Link>
      </div>

      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <h2 className="text-xl font-medium text-gray-700 mb-1">Subscription Details</h2>
        <p className="text-sm text-gray-600 mb-1"><strong>ID:</strong> {subscription.id}</p>
        <p className="text-sm text-gray-600 mb-1"><strong>School:</strong> {subscription.school.name} ({subscription.school.id})</p>
        <p className="text-sm text-gray-600 mb-4"><strong>Plan:</strong> {subscription.subscriptionPlan.name}</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="bg-white shadow-md rounded-lg p-6">
        {submitSuccess && <div className="mb-4 p-3 bg-green-100 text-green-700 border border-green-300 rounded-md">{submitSuccess}</div>}
        {error && !submitSuccess && <div className="mb-4 p-3 bg-red-100 text-red-700 border border-red-300 rounded-md">{error}</div>}

        <div className="mb-4">
          <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <select
            id="status"
            {...register("status")}
            className={`w-full p-2 border rounded-md shadow-sm ${errors.status ? 'border-red-500' : 'border-gray-300'}`}
          >
            {Object.values(SubscriptionStatus).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {errors.status && <p className="text-xs text-red-500 mt-1">{errors.status.message}</p>}
        </div>

        <div className="mb-4">
          <label htmlFor="currentPeriodStart" className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
          <input
            type="date"
            id="currentPeriodStart"
            {...register("currentPeriodStart")}
            className={`w-full p-2 border rounded-md shadow-sm ${errors.currentPeriodStart ? 'border-red-500' : 'border-gray-300'}`}
          />
          {errors.currentPeriodStart && <p className="text-xs text-red-500 mt-1">{errors.currentPeriodStart.message}</p>}
        </div>

        <div className="mb-4">
          <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">End Date (Optional)</label>
          <input
            type="date"
            id="endDate"
            {...register("endDate")}
            className={`w-full p-2 border rounded-md shadow-sm ${errors.endDate ? 'border-red-500' : 'border-gray-300'}`}
          />
          {errors.endDate && <p className="text-xs text-red-500 mt-1">{errors.endDate.message}</p>}
        </div>
        
        <div className="mb-6">
          <label htmlFor="stripeSubscriptionId" className="block text-sm font-medium text-gray-700 mb-1">Stripe Subscription ID (Optional)</label>
          <input
            type="text"
            id="stripeSubscriptionId"
            {...register("stripeSubscriptionId")}
            className={`w-full p-2 border rounded-md shadow-sm ${errors.stripeSubscriptionId ? 'border-red-500' : 'border-gray-300'}`}
            placeholder="e.g., sub_xxxxxxxxxxxxxx"
          />
          {errors.stripeSubscriptionId && <p className="text-xs text-red-500 mt-1">{errors.stripeSubscriptionId.message}</p>}
        </div>

        <div className="flex items-center justify-end space-x-3">
            <Link href="/system/school-subscriptions" className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">
                Cancel
            </Link>
            <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isSubmitting ? 'Updating...' : 'Update Subscription'}
            </button>
        </div>
      </form>
    </div>
  );
};

export default EditSchoolSubscriptionPage; 