'use client';

import { useState, useEffect } from 'react';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import { signIn } from 'next-auth/react';
import { FcGoogle } from 'react-icons/fc';

import { Background } from '@/components/background';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { acceptInvitationAction } from '@/actions/team-actions';

export default function SignUp() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get('invite');

  // Pre-fill email if coming from invitation
  useEffect(() => {
    if (inviteToken) {
      // We could fetch invitation details to pre-fill email, but for now we'll just show a message
      setSuccess('You have been invited to join an organization. Please create your account to accept the invitation.');
    }
  }, [inviteToken]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess('');

    // Validate passwords match
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    // Validate password strength
    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long');
      setIsLoading(false);
      return;
    }

    try {
      // Create user account (this would typically be done via API)
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create account');
      }

      const responseData = await response.json();
      
      // If user came from invitation, auto-accept it after successful signup
      if (inviteToken) {
        try {
          // Sign in the user first
          const signInResult = await signIn('credentials', {
            email: formData.email,
            password: formData.password,
            redirect: false,
          });

          if (signInResult?.ok) {
            // Accept the invitation
            const inviteResult = await acceptInvitationAction({ token: inviteToken });
            
            if (inviteResult?.data?.success) {
              setSuccess(`Account created successfully! ${inviteResult.data.message}`);
              // Redirect to organization dashboard
              setTimeout(() => {
                if (inviteResult.data.organizationSlug) {
                  router.push(`/${inviteResult.data.organizationSlug}/dashboard`);
                } else {
                  router.push('/dashboard');
                }
              }, 2000);
            } else {
              setSuccess('Account created successfully! Please sign in to accept your invitation.');
              setTimeout(() => {
                router.push('/auth/signin');
              }, 3000);
            }
          } else {
            setSuccess('Account created successfully! Please sign in to accept your invitation.');
            setTimeout(() => {
              router.push('/auth/signin');
            }, 3000);
          }
        } catch (inviteError) {
          console.error('Error accepting invitation:', inviteError);
          setSuccess('Account created successfully! Please sign in to accept your invitation.');
          setTimeout(() => {
            router.push('/auth/signin');
          }, 3000);
        }
      } else {
        // Normal signup flow
        setSuccess(`Account created successfully! ${responseData.message}`);
        setTimeout(() => {
          router.push('/auth/signin');
        }, 3000);
      }
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setIsLoading(true);
    try {
      // Preserve invite token in callback URL
      const callbackUrl = inviteToken ? `/accept-invite?token=${inviteToken}` : '/setup';
      await signIn('google', { callbackUrl });
    } catch {
      setError('An error occurred with Google sign up.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Background>
      <section className="py-28 lg:pt-44 lg:pb-32">
        <div className="container">
          <div className="flex flex-col gap-4">
            <Card className="mx-auto w-full max-w-sm">
              <CardHeader className="flex flex-col items-center space-y-0">
                <Image
                  src="/logo.svg"
                  alt="logo"
                  width={94}
                  height={18}
                  className="mb-7 dark:invert"
                />
                <p className="mb-2 text-2xl font-bold">Create an account</p>
                <p className="text-muted-foreground">
                  Please enter your details to get started.
                </p>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input
                      id="name"
                      name="name"
                      type="text"
                      placeholder="Enter your full name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="Enter your email"
                      value={formData.email}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      placeholder="Create a password"
                      value={formData.password}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="confirmPassword">Confirm Password</Label>
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      placeholder="Confirm your password"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  {success && (
                    <Alert>
                      <AlertDescription>{success}</AlertDescription>
                    </Alert>
                  )}
                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  <Button type="submit" className="mt-2 w-full" disabled={isLoading}>
                    {isLoading ? 'Creating account...' : 'Create account'}
                  </Button>
                  {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={handleGoogleSignUp}
                      disabled={isLoading}
                    >
                      <FcGoogle className="mr-2 size-5" />
                      Sign up with Google
                    </Button>
                  )}
                </form>
                <div className="text-muted-foreground mx-auto mt-8 flex justify-center gap-1 text-sm">
                  <p>Already have an account?</p>
                  <Link href="/auth/signin" className="text-primary font-medium">
                    Sign in
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </Background>
  );
}
