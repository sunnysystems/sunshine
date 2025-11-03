'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Trash2, Loader2, AlertTriangle } from 'lucide-react';

import { deleteAccountAction } from '@/actions/profile-actions';
import { deleteAccountSchema, type DeleteAccountData } from '@/lib/form-schema';
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
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface DeleteAccountDialogProps {
  children: React.ReactNode;
  isOwnerOfAnyOrg: boolean;
}

export function DeleteAccountDialog({ children, isOwnerOfAnyOrg }: DeleteAccountDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [confirmedDelete, setConfirmedDelete] = useState(false);
  const router = useRouter();

  const form = useForm<DeleteAccountData>({
    resolver: zodResolver(deleteAccountSchema),
    defaultValues: {
      confirmText: '',
      password: '',
    },
  });

  const onSubmit = async (data: DeleteAccountData) => {
    if (!confirmedDelete) {
      toast.error('Please confirm that you understand this action is irreversible');
      return;
    }

    setIsLoading(true);
    try {
      const result = await deleteAccountAction(data);

      if (result?.data?.success) {
        toast.success('Account deleted successfully');
        router.push('/auth/signin');
      } else {
        toast.error(result?.data?.message || 'Failed to delete account');
      }
    } catch (error) {
      console.error('Error deleting account:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete account');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" />
            Delete Account
          </DialogTitle>
          <DialogDescription>
            This action cannot be undone. This will permanently delete your account and all data.
          </DialogDescription>
        </DialogHeader>

        {isOwnerOfAnyOrg && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              You cannot delete your account while you are an owner of one or more organizations. 
              Please transfer ownership to another member first.
            </AlertDescription>
          </Alert>
        )}

        {!isOwnerOfAnyOrg && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              This will permanently delete your account, all your data, and your organization memberships.
            </AlertDescription>
          </Alert>
        )}

        {!isOwnerOfAnyOrg && (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="confirmText"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type DELETE to confirm</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="DELETE"
                        {...field}
                        onChange={(e) => {
                          field.onChange(e.target.value);
                          // Auto-update confirmedDelete based on input
                          if (e.target.value === 'DELETE' && confirmedDelete) {
                            setConfirmedDelete(true);
                          }
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Enter your current password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="confirm-checkbox"
                  checked={confirmedDelete}
                  onCheckedChange={setConfirmedDelete}
                />
                <label
                  htmlFor="confirm-checkbox"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  I understand this action is irreversible
                </label>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setOpen(false);
                    form.reset();
                    setConfirmedDelete(false);
                  }}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={isLoading || !confirmedDelete}
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Delete Account Permanently
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}

        {isOwnerOfAnyOrg && (
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false);
                form.reset();
                setConfirmedDelete(false);
              }}
            >
              Close
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

