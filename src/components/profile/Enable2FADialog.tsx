'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ShieldCheck, Loader2, QrCode, Copy, Download } from 'lucide-react';

import { generateMFASecretAction, verifyAndEnableMFAAction } from '@/actions/profile-actions';
import { enable2FASchema, type Enable2FAData } from '@/lib/form-schema';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface Enable2FADialogProps {
  children: React.ReactNode;
}

type Step = 'qrcode' | 'verify' | 'complete';

interface MfaSecretData {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

export function Enable2FADialog({ children }: Enable2FADialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<Step>('qrcode');
  const [mfaData, setMfaData] = useState<MfaSecretData | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  const form = useForm<Enable2FAData>({
    resolver: zodResolver(enable2FASchema),
    defaultValues: {
      verificationCode: '',
    },
  });

  useEffect(() => {
    if (open && step === 'qrcode' && !mfaData) {
      generateSecret();
    }
  }, [open, step]);

  const generateSecret = async () => {
    try {
      const result = await generateMFASecretAction();
      if (result?.data?.success && result.data.data) {
        setMfaData(result.data.data);
      }
    } catch (error) {
      console.error('Error generating MFA secret:', error);
      toast.error('Failed to generate MFA secret');
    }
  };

  const onSubmit = async (data: Enable2FAData) => {
    setIsLoading(true);
    try {
      const result = await verifyAndEnableMFAAction(data);

      if (result?.data?.success) {
        setBackupCodes(result.data.data?.backupCodes || []);
        setStep('complete');
        toast.success('2FA enabled successfully');
      } else {
        toast.error(result?.data?.message || 'Failed to enable 2FA');
      }
    } catch (error) {
      console.error('Error enabling 2FA:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to enable 2FA');
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const downloadBackupCodes = () => {
    const content = backupCodes.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'backup-codes.txt';
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Backup codes downloaded');
  };

  const handleClose = () => {
    setOpen(false);
    setStep('qrcode');
    setMfaData(null);
    setBackupCodes([]);
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Enable Two-Factor Authentication
          </DialogTitle>
          <DialogDescription>
            {step === 'qrcode' && 'Scan the QR code with your authenticator app'}
            {step === 'verify' && 'Enter the verification code from your app'}
            {step === 'complete' && 'Save your backup codes in a safe place'}
          </DialogDescription>
        </DialogHeader>

        {step === 'qrcode' && mfaData && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Step 1 of 3</CardTitle>
                <CardDescription>
                  Use your authenticator app to scan this QR code
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-center">
                  <div className="flex items-center justify-center w-48 h-48 bg-white border-2 border-dashed border-gray-300 rounded-lg">
                    <QrCode className="h-32 w-32 text-gray-400" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Secret Key:</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(mfaData.secret)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <code className="block text-xs bg-muted p-2 rounded break-all">
                    {mfaData.secret}
                  </code>
                </div>
              </CardContent>
            </Card>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => setStep('verify')}
              >
                Continue
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'verify' && (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="verificationCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Verification Code</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="000000"
                        maxLength={6}
                        className="text-center text-2xl tracking-widest"
                        onChange={(e) => {
                          const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                          field.onChange(value);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep('qrcode')}
                  disabled={isLoading}
                >
                  Back
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Verify & Enable
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}

        {step === 'complete' && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Step 3 of 3</CardTitle>
                <CardDescription>
                  Save these backup codes in a safe place
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-muted rounded-lg p-4 space-y-2">
                  {backupCodes.map((code, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between font-mono text-sm"
                    >
                      <span>{code}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(code)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={downloadBackupCodes}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => copyToClipboard(backupCodes.join('\n'))}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copy All
                  </Button>
                </div>
              </CardContent>
            </Card>

            <DialogFooter>
              <Button type="button" onClick={handleClose}>
                Done
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

