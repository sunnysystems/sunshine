import { NextRequest, NextResponse } from 'next/server';

import { createPasswordResetToken } from '@/lib/auth';
import { debugEmail, logError } from '@/lib/debug';
import { sendPasswordResetEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { message: 'Email is required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { message: 'Invalid email format' },
        { status: 400 }
      );
    }

    debugEmail('Forgot password request received', { email });

    const result = await createPasswordResetToken(email);

    if (result.success && result.token && result.user) {
      debugEmail('Password reset token created, sending email', {
        email,
        userId: result.user.id,
        userName: result.user.name
      });

      try {
        await sendPasswordResetEmail(
          email,
          result.token,
          result.user.name || 'User'
        );
        
        debugEmail('Password reset email sent successfully', { email });
      } catch (emailError) {
        logError(emailError, 'forgot-password.sendEmail');
        // Don't reveal email sending failure to user for security
      }
    } else {
      debugEmail('Password reset token creation failed or user not found', {
        email,
        success: result.success
      });
    }

    // Always return success for security (don't reveal if email exists)
    return NextResponse.json(
      { message: 'If an account with that email exists, we have sent a password reset link.' },
      { status: 200 }
    );
  } catch (error: unknown) {
    logError(error, 'forgot-password');
    
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
