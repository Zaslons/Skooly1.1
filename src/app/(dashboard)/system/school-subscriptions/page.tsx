'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { SchoolSubscription, SubscriptionPlan, School } from '@prisma/client';
import { SubscriptionStatus } from '@prisma/client';
import type { AuthUser } from '@/lib/auth';

interface EnrichedSchoolSubscription extends SchoolSubscription {
  school: { id: string; name: string };
  subscriptionPlan: { id: string; name: string };
}

interface PaginatedResponse {
  data: EnrichedSchoolSubscription[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
}

const SchoolSubscriptionsPage = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [subscriptions, setSubscriptions] = useState<EnrichedSchoolSubscription[]>([]);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [currentPage, setCurrentPage] = useState(Number(searchParams.get('page')) || 1);
  const [totalPages, setTotalPages] = useState(1);
  const [limit, setLimit] = useState(Number(searchParams.get('limit')) || 10);

  // Filters
  const [filterSchoolId, setFilterSchoolId] = useState(searchParams.get('schoolId') || '');
  const [filterPlanId, setFilterPlanId] = useState(searchParams.get('planId') || '');
  const [filterStatus, setFilterStatus] = useState(searchParams.get('status') || '');

  const fetchSchoolSubscriptions = useCallback(async (page: number, currentLimit: number, schoolId?: string, planId?: string, status?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      query.set('page', page.toString());
      query.set('limit', currentLimit.toString());
      if (schoolId) query.set('schoolId', schoolId);
      if (planId) query.set('planId', planId);
      if (status) query.set('status', status);

      const response = await fetch(`/api/system_admin/school-subscriptions?${query.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch school subscriptions');
      }
      const result: PaginatedResponse = await response.json();
      setSubscriptions(result.data);
      setCurrentPage(result.pagination.page);
      setTotalPages(result.pagination.totalPages);
      setLimit(result.pagination.limit); // Ensure limit state is also updated from response
      
      // Update URL without reloading page, for bookmarking/sharing filters
      const newPath = `/system/school-subscriptions?${query.toString()}`;
      router.replace(newPath, { scroll: false }); // use replace to avoid polluting history for filter changes

    } catch (err: any) {
      setError(err.message);
    }
    setIsLoading(false);
  }, [router]);

  useEffect(() => {
    const fetchUserAndInitialSubs = async () => {
      setIsLoading(true);
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
        // Initial fetch based on URL params or defaults
        fetchSchoolSubscriptions(currentPage, limit, filterSchoolId, filterPlanId, filterStatus);
      } catch (err: any) {
        setError(err.message);
        setIsLoading(false);
      }
    };
    fetchUserAndInitialSubs();
  // eslint-disable-next-line react-hooks/exhaustive-deps 
  }, [router, fetchSchoolSubscriptions, currentPage, limit, filterSchoolId, filterPlanId, filterStatus]); // Added router, fetchSchoolSubscriptions and filter/pagination states

 const handleFilterSubmit = (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    setCurrentPage(1); // Reset to first page on new filter
    fetchSchoolSubscriptions(1, limit, filterSchoolId, filterPlanId, filterStatus);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      fetchSchoolSubscriptions(newPage, limit, filterSchoolId, filterPlanId, filterStatus);
    }
  };

  if (isLoading && subscriptions.length === 0) { // Show initial loading state
    return <div className="p-4">Loading school subscriptions...</div>;
  }

  if (error && (!authUser || authUser.role !== 'system_admin')) {
    return <div className="p-4 text-red-500">Error: {error}</div>;
  }
  
  if (!authUser || authUser.role !== 'system_admin') {
    return <div className="p-4 text-red-500">Access Denied.</div>;
  }

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-2xl font-semibold text-gray-800 mb-6">School Subscriptions Management</h1>
      
      {/* Filter Form */}
      <form onSubmit={handleFilterSubmit} className="mb-6 p-4 bg-white shadow rounded-md flex flex-wrap gap-4 items-end">
        <div>
          <label htmlFor="filterSchoolId" className="block text-sm font-medium text-gray-700">School ID</label>
          <input type="text" id="filterSchoolId" value={filterSchoolId} onChange={e => setFilterSchoolId(e.target.value)} className="mt-1 p-2 border border-gray-300 rounded-md shadow-sm w-full md:w-auto"/>
        </div>
        <div>
          <label htmlFor="filterPlanId" className="block text-sm font-medium text-gray-700">Plan ID</label>
          <input type="text" id="filterPlanId" value={filterPlanId} onChange={e => setFilterPlanId(e.target.value)} className="mt-1 p-2 border border-gray-300 rounded-md shadow-sm w-full md:w-auto"/>
        </div>
        <div>
          <label htmlFor="filterStatus" className="block text-sm font-medium text-gray-700">Status</label>
          <select id="filterStatus" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="mt-1 p-2 border border-gray-300 rounded-md shadow-sm w-full md:w-auto">
            <option value="">All</option>
            {Object.values(SubscriptionStatus).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">Filter</button>
      </form>

      {isLoading && <p>Loading...</p>}
      {error && !isLoading && <p className="text-red-500">Error loading data: {error}</p>}
      
      {!isLoading && !error && subscriptions.length === 0 && (
        <p className="text-gray-600">No school subscriptions found matching your criteria.</p>
      )}

      {!isLoading && !error && subscriptions.length > 0 && (
        <>
          <div className="bg-white shadow-md rounded-lg overflow-x-auto mb-6">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">School Name (ID)</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plan Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Start Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">End Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {subscriptions.map((sub) => (
                  <tr key={sub.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{sub.school.name} ({sub.school.id.substring(0,8)}...)</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{sub.subscriptionPlan.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                            ${sub.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 
                              sub.status === 'TRIALING' ? 'bg-blue-100 text-blue-800' : 
                              sub.status === 'PAST_DUE' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'}`}>
                        {sub.status}
                        </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(sub.currentPeriodStart).toLocaleDateString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{sub.endDate ? new Date(sub.endDate).toLocaleDateString() : 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <Link href={`/system/school-subscriptions/${sub.id}/edit`} className="text-indigo-600 hover:text-indigo-900">
                        View/Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Pagination Controls */}
          <div className="flex justify-between items-center">
            <button 
              onClick={() => handlePageChange(currentPage - 1)} 
              disabled={currentPage <= 1 || isLoading}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              Previous
            </button>
            <span>Page {currentPage} of {totalPages}</span>
            <button 
              onClick={() => handlePageChange(currentPage + 1)} 
              disabled={currentPage >= totalPages || isLoading}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default SchoolSubscriptionsPage; 