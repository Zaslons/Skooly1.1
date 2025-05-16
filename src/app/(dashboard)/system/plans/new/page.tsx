'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { BillingCycle } from '@prisma/client';
import type { AuthUser } from '@/lib/auth';
import Link from 'next/link';

// Zod schema for plan creation (matches backend)
const planFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  price: z.coerce.number().min(0, "Price must be non-negative"), // coerce to number
  currency: z.string().min(2, "Currency code is required (e.g., USD)").max(3),
  billingCycle: z.nativeEnum(BillingCycle),
  features: z.string().transform(val => val.split('\n').map(s => s.trim()).filter(s => s)), // Transforms textarea newline to string[]
  maxStudents: z.coerce.number().int().positive().optional().nullable().or(z.literal('').transform(() => null)), // Handle empty string for optional number
  maxTeachers: z.coerce.number().int().positive().optional().nullable().or(z.literal('').transform(() => null)),
  isActive: z.boolean().optional().default(true),
});

type PlanFormValues = z.infer<typeof planFormSchema>;

const CreateSubscriptionPlanPage = () => {
  const router = useRouter();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<PlanFormValues>({
    resolver: zodResolver(planFormSchema),
    defaultValues: {
      name: '',
      price: 0,
      currency: 'USD',
      billingCycle: BillingCycle.MONTHLY,
      features: [], // Will be a string in textarea, transformed by Zod
      maxStudents: null,
      maxTeachers: null,
      isActive: true,
    },
  });

  useEffect(() => {
    const fetchUser = async () => {
      setIsLoadingUser(true);
      try {
        const authResponse = await fetch('/api/auth/me');
        if (!authResponse.ok) {
          if (authResponse.status === 401) router.push('/sign-in');
          throw new Error('Failed to fetch user data');
        }
        const user: AuthUser = await authResponse.json();
        setAuthUser(user);
        if (user.role !== 'system_admin') {
          // Redirect or show access denied immediately
          router.push('/system/plans?error=access_denied'); 
        }
      } catch (err) {
        router.push('/sign-in?error=auth_failed');
      }
      setIsLoadingUser(false);
    };
    fetchUser();
  }, [router]);

  const onSubmit: SubmitHandler<PlanFormValues> = async (data) => {
    setFormError(null);
    try {
      const response = await fetch('/api/system_admin/subscription-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        alert('Subscription plan created successfully!');
        router.push('/system/plans'); // Redirect to plans list
      } else {
        const errorData = await response.json();
        setFormError(errorData.message || 'Failed to create plan. Please try again.');
      }
    } catch (error) {
      setFormError('An unexpected error occurred. Please try again.');
      console.error("Form submission error:", error);
    }
  };
  
  if (isLoadingUser || !authUser || authUser.role !== 'system_admin') {
    return <div className="p-4">Loading or Access Denied...</div>; 
  }

  // Basic styling for form elements - can be enhanced with Tailwind components
  const inputClass = "mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm";
  const labelClass = "block text-sm font-medium text-gray-700";
  const errorClass = "mt-1 text-xs text-red-500";

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">Create New Subscription Plan</h1>
        <Link href="/system/plans" className="text-sm text-blue-600 hover:underline">
          &larr; Back to Plans
        </Link>
      </div>

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

        {formError && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{formError}</p>}

        <div className="flex justify-end space-x-3">
            <Link href="/system/plans" className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancel
            </Link>
            <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
            {isSubmitting ? 'Creating...' : 'Create Plan'}
            </button>
        </div>
      </form>
    </div>
  );
};

export default CreateSubscriptionPlanPage; 