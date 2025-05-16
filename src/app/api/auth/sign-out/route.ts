import { NextRequest, NextResponse } from 'next/server';

// Changed to GET handler and added redirect
export async function GET(request: NextRequest) { 
  try {
    // Create a response object. For redirection, we can use NextResponse.redirect
    // but we need to clear cookies first, so we'll construct a response, clear cookie, then set redirect header.
    
    // Redirect to the landing page (root)
    const redirectUrl = new URL('/', request.url); 
    const response = NextResponse.redirect(redirectUrl, { status: 302 }); // 302 for temporary redirect

    // Clear the auth_token cookie on this response before returning it
    response.cookies.set('auth_token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      sameSite: 'lax',
      maxAge: 0, // Expire the cookie immediately
    });

    console.log('[API /auth/sign-out] Cleared auth_token cookie and redirecting to /.');
    return response;
  } catch (error) {
    console.error('[API /auth/sign-out] Error:', error);
    // Fallback redirect in case of error, or return an error message
    // It's generally safer to still try to redirect to landing page
    const errorRedirectUrl = new URL('/?error=logout_failed', request.url);
    const errorResponse = NextResponse.redirect(errorRedirectUrl, { status: 302 });
    // Attempt to clear cookie even on error path
    errorResponse.cookies.set('auth_token', '', { maxAge: 0, path: '/' });
    return errorResponse;
  }
} 