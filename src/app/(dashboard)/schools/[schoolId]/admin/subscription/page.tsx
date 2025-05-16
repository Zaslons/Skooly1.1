'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { SchoolSubscription, SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import type { AuthUser } from '@/lib/auth';
import Link from 'next/link';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

interface EnrichedCurrentSubscription extends SchoolSubscription {
  plan: SubscriptionPlan;
}

const SchoolAdminSubscriptionPage = () => {
  const router = useRouter();
  const params = useParams();
  const schoolId = params.schoolId as string;

  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [currentSubscription, setCurrentSubscription] = useState<EnrichedCurrentSubscription | null>(null);
  const [availablePlans, setAvailablePlans] = useState<SubscriptionPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const fetchInitialData = async () => {
      if (!schoolId) return;
      setIsLoading(true);
      setError(null);
      try {
        // 1. Fetch authenticated user
        const authRes = await fetch('/api/auth/me');
        if (!authRes.ok) {
          if (authRes.status === 401) {
            toast.error('Session expired. Redirecting to sign-in...');
            router.push('/sign-in');
            return;
          }
          throw new Error('Failed to fetch user data');
        }
        const user: AuthUser = await authRes.json();
        setAuthUser(user);

        // 2. Authorize: Must be admin of this school
        if (user.role !== 'admin' || user.schoolId !== schoolId) {
          setError('Access Denied. You do not have permission to manage subscriptions for this school.');
          setIsLoading(false);
          return;
        }

        // 3. Fetch current subscription
        const currentSubRes = await fetch(`/api/schools/${schoolId}/subscriptions/current`);
        if (currentSubRes.ok) {
          // The API returns SchoolSubscription & { subscriptionPlan: SubscriptionPlan }
          const apiResponse = await currentSubRes.json() as SchoolSubscription & { subscriptionPlan?: SubscriptionPlan };
          if (apiResponse && apiResponse.subscriptionPlan) {
            const enrichedSub: EnrichedCurrentSubscription = {
              ...apiResponse,
              plan: apiResponse.subscriptionPlan, // Map subscriptionPlan to plan
            };
            setCurrentSubscription(enrichedSub);
          } else {
            // This case can happen if the subscription exists but somehow subscriptionPlan is not included
            // or if the structure is not as expected. Setting to null or handling as an error might be appropriate.
            setCurrentSubscription(null); 
            console.warn('Fetched subscription data is missing subscriptionPlan details.');
          }
        } else if (currentSubRes.status !== 404) { // 404 is okay, means no active sub
          const errData = await currentSubRes.json();
          console.warn('Could not fetch current subscription:', errData.error || 'Failed to fetch current subscription');
        }

        // 4. Fetch available plans
        const plansRes = await fetch('/api/subscription-plans');
        if (!plansRes.ok) {
          const errData = await plansRes.json();
          throw new Error(errData.error || 'Failed to fetch subscription plans');
        }
        const plansData: SubscriptionPlan[] = await plansRes.json();
        setAvailablePlans(plansData.filter(plan => plan.isActive));

      } catch (err: any) {
        setError(err.message);
        toast.error(err.message);
      }
      setIsLoading(false);
    };

    fetchInitialData();
  }, [schoolId, router]);

  const handleSubscribe = async (planId: string) => {
    setActionLoading(true);
    setError(null); // Clear previous errors
    try {
      const response = await fetch(`/api/schools/${schoolId}/subscriptions/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to initiate subscription process');
      }

      if (data.url) {
        // Redirect to Stripe Checkout
        window.location.href = data.url;
      } else {
        // This case should ideally not happen if the API behaves as expected
        console.error("Stripe Checkout URL not received from API");
        throw new Error('Could not retrieve payment page. Please try again.');
      }
      // The toast.success and setCurrentSubscription calls will be removed from here,
      // as success is now determined by Stripe Checkout and webhook processing.
    } catch (err: any) {
      const errorMessage = err.message || 'An unexpected error occurred during subscription.';
      setError(errorMessage); // Set error state to display in UI
      toast.error(errorMessage);
      setActionLoading(false); // Ensure loading is stopped on error
    }
    // setActionLoading(false) is moved inside the catch or should not be reached if redirecting
  };

  if (isLoading) {
    return <div className="p-6">Loading subscription details...</div>;
  }

  if (error) {
    return <div className="p-6 text-red-500">Error: {error}</div>;
  }
  
  if (!authUser || authUser.role !== 'admin' || authUser.schoolId !== schoolId) {
    return <div className="p-6 text-red-500">Access Denied.</div>;
  }

  const renderBillingCycle = (cycle: string) => {
    if (!cycle) return '';
    return cycle.charAt(0).toUpperCase() + cycle.slice(1).toLowerCase();
  };

  return (
    <div className="p-4 md:p-6">
      <ToastContainer 
        position="top-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="colored"
      />
      <h1 className="text-2xl font-semibold text-gray-800 mb-6">Subscription Management</h1>

      {/* Current Subscription Section */}
      <div className="bg-white shadow-md rounded-lg p-6 mb-8">
        <h2 className="text-xl font-semibold text-gray-700 mb-4">Your Current Subscription</h2>
        {currentSubscription ? (
          <div>
            <p className="text-lg"><strong>Plan:</strong> {currentSubscription.plan.name}</p>
            <p><strong>Status:</strong> 
                <span className={`px-2 py-0.5 ml-1 text-sm inline-flex font-semibold rounded-full 
                    ${currentSubscription.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 
                    currentSubscription.status === 'TRIALING' ? 'bg-blue-100 text-blue-800' : 
                    currentSubscription.status === 'PAST_DUE' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'}`}>
                {currentSubscription.status}
                </span>
            </p>
            <p><strong>Price:</strong> ${currentSubscription.plan.price.toString()} / {renderBillingCycle(currentSubscription.plan.billingCycle)}</p>
            <p><strong>Features:</strong> {currentSubscription.plan.features.join(', ') || 'N/A'}</p>
            {currentSubscription.plan.maxStudents && <p><strong>Max Students:</strong> {currentSubscription.plan.maxStudents}</p>}
            {currentSubscription.plan.maxTeachers && <p><strong>Max Teachers:</strong> {currentSubscription.plan.maxTeachers}</p>}
            <p><strong>Subscribed Since:</strong> {new Date(currentSubscription.currentPeriodStart).toLocaleDateString()}</p>
            {currentSubscription.endDate && <p><strong>Subscription Ends:</strong> {new Date(currentSubscription.endDate).toLocaleDateString()}</p>}
          </div>
        ) : (
          <p className="text-gray-600">You do not have an active subscription.</p>
        )}
      </div>

      {/* Available Plans Section */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-700 mb-4">Available Subscription Plans</h2>
        {availablePlans.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {availablePlans.map((plan) => (
              <div key={plan.id} className="bg-white shadow-lg rounded-lg p-6 flex flex-col justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-blue-600 mb-2">{plan.name}</h3>
                  <p className="text-2xl font-bold mb-2">${plan.price.toString()}<span className="text-sm font-normal text-gray-500"> / {renderBillingCycle(plan.billingCycle)}</span></p>
                  <ul className="list-disc list-inside text-sm text-gray-600 mb-4 space-y-1">
                    {plan.features.map((feature, index) => <li key={index}>{feature}</li>)}
                    {plan.maxStudents && <li>Up to {plan.maxStudents} students</li>}
                    {plan.maxTeachers && <li>Up to {plan.maxTeachers} teachers</li>}
                  </ul>
                </div>
                <button 
                  onClick={() => handleSubscribe(plan.id)}
                  disabled={actionLoading || currentSubscription?.plan.id === plan.id}
                  className="w-full mt-4 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 disabled:opacity-50 disabled:cursor-not-allowed">
                  {actionLoading ? 'Processing...' : (currentSubscription?.plan.id === plan.id ? 'Current Plan' : 'Choose Plan')}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-600">No subscription plans are currently available. Please check back later.</p>
        )}
      </div>
    </div>
  );
};

export default SchoolAdminSubscriptionPage; 