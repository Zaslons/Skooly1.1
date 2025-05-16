import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken, UserRole } from './lib/auth';

// Define public routes (accessible without authentication)
const PUBLIC_ROUTES = ['/sign-in', '/sign-up', '/'];
// Define the school creation page route, which has special handling
const CREATE_SCHOOL_ROUTE = '/create-school';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const url = request.nextUrl.clone();
  console.log(`[Middleware] START: Pathname: ${pathname}`);

  let token = request.headers.get('authorization')?.split(' ')[1];
  if (!token) {
    token = request.cookies.get('auth_token')?.value;
  }
  console.log(`[Middleware] Token: ${token ? 'Present' : 'Absent'}`);

  const user = token ? await verifyToken(token) : null;
  console.log('[Middleware] Decoded user:', user ? { id: user.id, role: user.role, schoolId: user.schoolId, username: user.username } : null);

  // Allow access to explicitly public routes
  if (PUBLIC_ROUTES.includes(pathname)) {
    console.log(`[Middleware] Path is PUBLIC: ${pathname}`);
    // Special case for root: if authenticated & has school, redirect to school dashboard
    if (pathname === '/' && user && user.schoolId) {
      console.log(`[Middleware] Root, user with schoolId. Redirecting to /schools/${user.schoolId}/${user.role}`);
      url.pathname = `/schools/${user.schoolId}/${user.role}`;
      return NextResponse.redirect(url);
    }
    // Special case for root: if authenticated, system_admin, redirect to their dashboard
    if (pathname === '/' && user && user.role === 'system_admin') {
        console.log(`[Middleware] Root, system_admin. Redirecting to /system/plans`);
        url.pathname = '/system/plans'; 
        return NextResponse.redirect(url);
    }
    // Special case for root: if authenticated, no school, AND NOT system_admin, redirect to create-school
    if (pathname === '/' && user && !user.schoolId && user.role !== 'system_admin') {
        console.log(`[Middleware] Root, user without schoolId, not system_admin. Redirecting to ${CREATE_SCHOOL_ROUTE}`);
        url.pathname = CREATE_SCHOOL_ROUTE;
        return NextResponse.redirect(url);
    }
    console.log(`[Middleware] Path is PUBLIC, proceeding: ${pathname}`);
    return NextResponse.next();
  }

  console.log(`[Middleware] Path is NOT PUBLIC: ${pathname}`);

  // Handle /create-school route
  if (pathname === CREATE_SCHOOL_ROUTE) {
    console.log(`[Middleware] Path is CREATE_SCHOOL_ROUTE: ${pathname}`);
    if (user && user.schoolId) {
      console.log(`[Middleware] CREATE_SCHOOL_ROUTE, user with schoolId. Redirecting to /schools/${user.schoolId}/${user.role}`);
      url.pathname = `/schools/${user.schoolId}/${user.role}`;
      return NextResponse.redirect(url);
    }
    console.log(`[Middleware] CREATE_SCHOOL_ROUTE, user without schoolId or no user. Proceeding.`);
    return NextResponse.next(); 
  }

  // All other routes are protected by default from this point
  if (!user) {
    console.log(`[Middleware] No user found. Redirecting to /sign-in.`);
    url.pathname = '/sign-in';
    if (pathname !== '/sign-in') {
        url.searchParams.set('redirectedFrom', pathname);
    }
    return NextResponse.redirect(url);
  }

  console.log(`[Middleware] User is authenticated. Role: ${user.role}, SchoolId: ${user.schoolId}`);

  // User is authenticated, now handle role-based access for /schools/...
  const { role, schoolId } = user;

  if (pathname.startsWith('/system')) {
    console.log(`[Middleware] Path starts with /system.`);
    if (role === 'system_admin') {
      console.log(`[Middleware] System_admin accessing /system path. Proceeding.`);
      return NextResponse.next();
    } else {
      console.log(`[Middleware] Non-system_admin trying to access /system. Redirecting to /sign-in (or their home).`);
      // For now, redirect to sign-in, could be more specific like user's home if already logged in
      url.pathname = schoolId ? `/schools/${schoolId}/${role}` : '/sign-in';
      return NextResponse.redirect(url);
    }
  }

  if (pathname.startsWith('/schools/')) {
    console.log(`[Middleware] Path starts with /schools/.`);
    if (!schoolId) {
      console.log(`[Middleware] User has no schoolId but trying to access /schools. Redirecting to ${CREATE_SCHOOL_ROUTE}`);
      url.pathname = CREATE_SCHOOL_ROUTE;
      return NextResponse.redirect(url);
    }

    const schoolPathSegment = pathname.split('/')[2];
    if (schoolPathSegment !== schoolId) {
        console.log(`[Middleware] User attempting to access different school. Denying and redirecting to own school /schools/${schoolId}/${role}`);
        url.pathname = `/schools/${schoolId}/${role}`; 
        return NextResponse.redirect(url);
    }
    console.log(`[Middleware] User accessing their own school path. Proceeding.`);
    return NextResponse.next();
  }
  
  console.log(`[Middleware] Fallback redirection logic reached.`);
  // Fallback for any other authenticated scenarios not yet covered
  if (role === 'system_admin') {
    console.log(`[Middleware] Fallback: system_admin. Redirecting to /system/plans.`);
    url.pathname = '/system/plans';
  } else if (schoolId) {
    console.log(`[Middleware] Fallback: user with schoolId. Redirecting to /schools/${schoolId}/${role}.`);
    url.pathname = `/schools/${schoolId}/${role}`;
  } else {
    console.log(`[Middleware] Fallback: user without schoolId, not system_admin. Redirecting to ${CREATE_SCHOOL_ROUTE}.`);
    url.pathname = CREATE_SCHOOL_ROUTE;
  }
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - .*\..* (files with extensions, e.g. images, css, js in public folder)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\..*).*)',
  ],
};
