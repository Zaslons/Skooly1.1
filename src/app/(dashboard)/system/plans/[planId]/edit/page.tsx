'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { BillingCycle, type SubscriptionPlan } from '@prisma/client';
import type { AuthUser } from '@/lib/auth';
import Link from 'next/link';

// Zod schema for plan update (matches backend, all fields optional for PUT)
const planFormSchema = z.object({
  name: z.string().min(1, "Name is required").optional(),
  price: z.coerce.number().min(0, "Price must be non-negative").optional(),
  currency: z.string().min(2, "Currency code is required").max(3).optional(),
  billingCycle: z.nativeEnum(BillingCycle).optional(),
  features: z.string().optional(),
  maxStudents: z.coerce.number().int().positive().optional().nullable().or(z.literal('').transform(() => null)),
  maxTeachers: z.coerce.number().int().positive().optional().nullable().or(z.literal('').transform(() => null)),
  isActive: z.boolean().optional(),
});

type PlanFormValues = z.infer<typeof planFormSchema>;

const EditSubscriptionPlanPage = () => {
  const router = useRouter();
  const params = useParams();
  const planId = params.planId as string;

  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [isLoadingPlan, setIsLoadingPlan] = useState(true);

  const {
    register,
    handleSubmit,
    reset, // To populate form with fetched data
    formState: { errors, isSubmitting },
  } = useForm<PlanFormValues>({
    resolver: zodResolver(planFormSchema),
  });

  useEffect(() => {
    const fetchUserAndPlan = async () => {
      setIsLoadingUser(true);
      setIsLoadingPlan(true);
      try {
        const authResponse = await fetch('/api/auth/me');
        if (!authResponse.ok) {
          if (authResponse.status === 401) router.push('/sign-in');
          throw new Error('Failed to fetch user data');
        }
        const user: AuthUser = await authResponse.json();
        setAuthUser(user);

        if (user.role !== 'system_admin') {
          router.push('/system/plans?error=access_denied');
          return;
        }
        setIsLoadingUser(false);

        if (planId) {
          const planResponse = await fetch(`/api/system_admin/subscription-plans/${planId}`);
          if (!planResponse.ok) {
            if (planResponse.status === 404) setFormError('Subscription plan not found.');
            else throw new Error('Failed to fetch subscription plan details');
          } else {
            const planData: SubscriptionPlan = await planResponse.json();
            // Populate form with existing plan data
            reset({
              ...planData,
              price: Number(planData.price), // Ensure price is number
              features: planData.features.join('\n'), // Convert array back to newline string for textarea
              maxStudents: planData.maxStudents ?? null, // Ensure null if undefined
              maxTeachers: planData.maxTeachers ?? null,
            });
          }
        }
      } catch (err: any) {
        setFormError(err.message || 'Error loading data.');
        console.error("Error fetching data:", err);
      }
      setIsLoadingUser(false); // Also set here in case of early return for non-admin
      setIsLoadingPlan(false);
    };

    fetchUserAndPlan();
  }, [router, planId, reset]);

  const onSubmit: SubmitHandler<PlanFormValues> = async (data) => {
    setFormError(null);
    
    const updateData: Record<string, any> = {}; // Use a more flexible type for constructing the payload
    
    // Populate updateData with defined fields from the form
    for (const key in data) {
        if (data[key as keyof PlanFormValues] !== undefined) {
            updateData[key] = data[key as keyof PlanFormValues];
        }
    }

    // Specifically handle features: convert string to array of strings
    if (typeof data.features === 'string') {
        updateData.features = data.features.split('\n').map(s => s.trim()).filter(s => s);
    } else if (data.features === undefined) {
        // If features was optional and not provided, we might want to send undefined or an empty array
        // Depending on API requirements. Assuming API expects undefined if no change or empty array if cleared.
        // If it was initially null and became undefined, no change. If it was a string and cleared, it becomes [].
        // This logic depends on whether an empty string for features means "clear them" or "no change".
        // For simplicity, if data.features is undefined, it means it wasn't in the form or was cleared to undefined state.
        // If schema allows .optional() without a default, it can be undefined.
        // If we need to send empty array for cleared features: (commenting out for now)
        // updateData.features = []; 
    }
    // if data.features was null, it would likely be filtered by the loop above if not changed.

    if (Object.keys(updateData).length === 0) {
        setFormError("No changes detected to submit.");
        return;
    }

    try {
      const response = await fetch(`/api/system_admin/subscription-plans/${planId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });

      if (response.ok) {
        alert('Subscription plan updated successfully!');
        router.push('/system/plans');
      } else {
        const errorData = await response.json();
        setFormError(errorData.message || 'Failed to update plan.');
      }
    } catch (error) {
      setFormError('An unexpected error occurred.');
      console.error("Form submission error:", error);
    }
  };

  if (isLoadingUser || isLoadingPlan) {
    return <div className="p-4">Loading...</div>;
  }

  if (!authUser || authUser.role !== 'system_admin') {
    return <div className="p-4 text-red-500">Access Denied.</div>;
  }
  if (formError && !isSubmitting) { // Show general form error if not specifically a loading error
    // Only show if not loading and not submitting, to avoid overlap with submission errors
  }

  // Basic styling for form elements - can be enhanced with Tailwind components
  const inputClass = "mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm";
  const labelClass = "block text-sm font-medium text-gray-700";
  const errorClass = "mt-1 text-xs text-red-500";

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">Edit Subscription Plan</h1>
        <Link href="/system/plans" className="text-sm text-blue-600 hover:underline">
          &larr; Back to Plans
        </Link>
      </div>

      {formError && <p className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded-md">{formError}</p>}
      
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 bg-white p-6 shadow-md rounded-lg">
        <div>
          <label htmlFor="name" className={labelClass}>Plan Name</label>
          <input id="name" type="text" {...register("name")} className={inputClass} />
          {errors.name && <p className={errorClass}>{errors.name.message}</p>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="price" className={labelClass}>Price</label>
            <input id="price" type="number" step="0.01" {...register("price")} className={inputClass} />
            {errors.price && <p className={errorClass}>{errors.price.message}</p>}
          </div>
          <div>
            <label htmlFor="currency" className={labelClass}>Currency (e.g., USD)</label>
            <input id="currency" type="text" {...register("currency")} className={inputClass} />
            {errors.currency && <p className={errorClass}>{errors.currency.message}</p>}
          </div>
        </div>
        
        <div>
          <label htmlFor="billingCycle" className={labelClass}>Billing Cycle</label>
          <select id="billingCycle" {...register("billingCycle")} className={inputClass}>
            {Object.values(BillingCycle).map(cycle => (
              <option key={cycle} value={cycle}>{cycle}</option>
            ))}
          </select>
          {errors.billingCycle && <p className={errorClass}>{errors.billingCycle.message}</p>}
        </div>

        <div>
          <label htmlFor="features" className={labelClass}>Features (one per line)</label>
          <textarea id="features" rows={4} {...register("features")} className={inputClass} placeholder="Feature 1\nFeature 2\nFeature 3" />
          {errors.features && <p className={errorClass}>{errors.features.message}</p>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="maxStudents" className={labelClass}>Max Students (optional)</label>
            <input id="maxStudents" type="number" {...register("maxStudents")} className={inputClass} placeholder="e.g., 100" />
            {errors.maxStudents && <p className={errorClass}>{errors.maxStudents.message}</p>}
          </div>
          <div>
            <label htmlFor="maxTeachers" className={labelClass}>Max Teachers (optional)</label>
            <input id="maxTeachers" type="number" {...register("maxTeachers")} className={inputClass} placeholder="e.g., 10"/>
            {errors.maxTeachers && <p className={errorClass}>{errors.maxTeachers.message}</p>}
          </div>
        </div>

        <div className="flex items-center">
          <input id="isActive" type="checkbox" {...register("isActive")} className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500" />
          <label htmlFor="isActive" className="ml-2 block text-sm text-gray-900">Plan is Active</label>
        </div>
        {errors.isActive && <p className={errorClass}>{errors.isActive.message}</p>}

        <div className="flex justify-end space-x-3">
            <Link href="/system/plans" className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancel
            </Link>
            <button type="submit" disabled={isSubmitting || isLoadingPlan} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
            {isSubmitting ? 'Updating...' : 'Update Plan'}
            </button>
        </div>
      </form>
    </div>
  );
};

export default EditSubscriptionPlanPage; 