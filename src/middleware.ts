import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken, UserRole } from './lib/auth';

// Define public routes (accessible without authentication)
const PUBLIC_ROUTES = ['/sign-in', '/sign-up', '/', '/join'];
const CREATE_SCHOOL_ROUTE = '/create-school';
const SELECT_SCHOOL_ROUTE = '/select-school';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const url = request.nextUrl.clone();

  let token = request.headers.get('authorization')?.split(' ')[1];
  if (!token) {
    token = request.cookies.get('auth_token')?.value;
  }

  const user = token ? await verifyToken(token) : null;

  if (PUBLIC_ROUTES.includes(pathname)) {
    if (pathname === '/' && user && user.schoolId) {
      url.pathname = `/schools/${user.schoolId}/${user.role}`;
      return NextResponse.redirect(url);
    }
    if (pathname === '/' && user && user.role === 'system_admin') {
      url.pathname = '/system/plans'; 
      return NextResponse.redirect(url);
    }
    if (pathname === '/' && user && !user.schoolId && user.role !== 'system_admin') {
      url.pathname = CREATE_SCHOOL_ROUTE;
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (pathname === CREATE_SCHOOL_ROUTE) {
    if (user && user.schoolId) {
      url.pathname = `/schools/${user.schoolId}/${user.role}`;
      return NextResponse.redirect(url);
    }
    return NextResponse.next(); 
  }

  if (pathname === SELECT_SCHOOL_ROUTE) {
    if (!user) {
      url.pathname = '/sign-in';
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (!user) {
    url.pathname = '/sign-in';
    if (pathname !== '/sign-in') {
      url.searchParams.set('redirectedFrom', pathname);
    }
    return NextResponse.redirect(url);
  }

  const { role, schoolId } = user;

  if (pathname.startsWith('/system')) {
    if (role === 'system_admin') {
      return NextResponse.next();
    }
    url.pathname = schoolId ? `/schools/${schoolId}/${role}` : '/sign-in';
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith('/schools/')) {
    if (!schoolId) {
      url.pathname = CREATE_SCHOOL_ROUTE;
      return NextResponse.redirect(url);
    }

    const schoolPathSegment = pathname.split('/')[2];
    if (schoolPathSegment !== schoolId) {
      url.pathname = `/schools/${schoolId}/${role}`; 
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }
  
  if (role === 'system_admin') {
    url.pathname = '/system/plans';
  } else if (schoolId) {
    url.pathname = `/schools/${schoolId}/${role}`;
  } else {
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
