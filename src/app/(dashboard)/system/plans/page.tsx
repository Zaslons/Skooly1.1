'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SubscriptionPlan } from '@prisma/client'; // Assuming this type is available
import type { AuthUser } from '@/lib/auth'; // For checking role

// Helper to format currency - adjust as needed
const formatCurrency = (amount: number, currencyCode: string) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(amount);
};

const SubscriptionPlansPage = () => {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const fetchInitialData = async () => {
      setIsLoading(true);
      try {
        // Fetch authenticated user to check role client-side as an extra check
        // Middleware should be the primary guard for page access.
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

        // Fetch subscription plans for system admin
        const plansResponse = await fetch('/api/system_admin/subscription-plans');
        if (!plansResponse.ok) {
          throw new Error('Failed to fetch subscription plans');
        }
        const plansData = await plansResponse.json();
        setPlans(plansData);
      } catch (err: any) {
        setError(err.message);
      }
      setIsLoading(false);
    };
    fetchInitialData();
  }, [router]);

  const handleDeletePlan = async (planId: string) => {
    if (!confirm('Are you sure you want to delete this subscription plan? This action might fail if the plan is in use.')) {
      return;
    }
    try {
      const response = await fetch(`/api/system_admin/subscription-plans/${planId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setPlans(plans.filter(p => p.id !== planId));
        alert('Plan deleted successfully!');
      } else {
        const errorData = await response.json();
        alert(`Failed to delete plan: ${errorData.message || response.statusText}`);
      }
    } catch (err: any) {
      alert(`Error deleting plan: ${err.message}`);
    }
  };
  
  // Optional: A function to toggle plan active status (if you prefer soft delete/deactivation)
  const handleToggleActiveStatus = async (plan: SubscriptionPlan) => {
    const newStatus = !plan.isActive;
    if (confirm(`Are you sure you want to ${newStatus ? 'activate' : 'deactivate'} this plan?`)) {
        try {
            const response = await fetch(`/api/system_admin/subscription-plans/${plan.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: newStatus }),
            });
            if (response.ok) {
                const updatedPlan = await response.json();
                setPlans(plans.map(p => p.id === plan.id ? updatedPlan : p));
                alert(`Plan ${newStatus ? 'activated' : 'deactivated'} successfully!`);
            } else {
                const errorData = await response.json();
                alert(`Failed to update plan: ${errorData.message || response.statusText}`);
            }
        } catch (err: any) {
            alert(`Error updating plan: ${err.message}`);
        }
    }
  };

  if (isLoading) {
    return <div className="p-4">Loading subscription plans...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-500">Error: {error}</div>;
  }
  
  // Ensure authUser is loaded and is system_admin before rendering sensitive content
  if (!authUser || authUser.role !== 'system_admin') {
    // This case should ideally be handled by the error state or redirection, but as a fallback:
    return <div className="p-4 text-red-500">Access Denied.</div>;
  }

  return (
    <div className="p-4 md:p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">Manage Subscription Plans</h1>
        <Link href="/system/plans/new" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
          Create New Plan
        </Link>
      </div>

      {plans.length === 0 ? (
        <p className="text-gray-600">No subscription plans found. Create one to get started!</p>
      ) : (
        <div className="bg-white shadow-md rounded-lg overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Billing Cycle</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {plans.map((plan) => (
                <tr key={plan.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{plan.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatCurrency(Number(plan.price), plan.currency)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{plan.billingCycle}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${plan.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {plan.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    <Link href={`/system/plans/${plan.id}/edit`} className="text-indigo-600 hover:text-indigo-900">
                      Edit
                    </Link>
                    <button 
                        onClick={() => handleToggleActiveStatus(plan)} 
                        className={`${plan.isActive ? 'text-yellow-600 hover:text-yellow-900' : 'text-green-600 hover:text-green-900'}`}>
                      {plan.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button onClick={() => handleDeletePlan(plan.id)} className="text-red-600 hover:text-red-900">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default SubscriptionPlansPage; 