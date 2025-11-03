import { NextResponse } from 'next/server';

import { getServerSession } from 'next-auth/next';

import { authOptions } from '@/lib/auth';
// Note: 2FA is currently mocked, so email sending is not implemented
// import { generate2FACode, store2FACode } from '@/lib/two-factor';

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id || !session?.user?.email || !session?.user?.name) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Note: 2FA is currently mocked, so this endpoint returns success without sending emails
    // When implementing real 2FA, uncomment the following:
    // const code = generate2FACode();
    // await store2FACode(session.user.id, code);
    // await send2FACode(session.user.email, code, session.user.name);

    return NextResponse.json(
      { message: 'Verification code sent successfully' },
      { status: 200 }
    );
  } catch (error: unknown) {
    // eslint-disable-next-line no-console
    console.error('Resend 2FA error:', error);
    
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
