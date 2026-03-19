import { NextResponse } from 'next/server';
import { validateJoinCode } from '@/lib/actions/joinCodeActions';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.json({ valid: false, message: 'No code provided.' }, { status: 400 });
  }

  const result = await validateJoinCode(code);
  return NextResponse.json(result);
}
