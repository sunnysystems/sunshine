'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Trash2, Loader2, AlertTriangle } from 'lucide-react';

import { deleteOrganizationAction } from '@/actions/organization-actions';
import { deleteOrganizationSchema, type DeleteOrganizationData } from '@/lib/form-schema';
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
import { Alert, AlertDescription } from '@/components/ui/alert';

interface DeleteOrganizationDialogProps {
  children: React.ReactNode;
  organizationId: string;
  organizationName: string;
}

export function DeleteOrganizationDialog({ 
  children, 
  organizationId,
  organizationName 
}: DeleteOrganizationDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const form = useForm<DeleteOrganizationData>({
    resolver: zodResolver(deleteOrganizationSchema),
    defaultValues: {
      organizationId,
      confirmText: '',
    },
  });

  const onSubmit = async (data: DeleteOrganizationData) => {
    if (data.confirmText !== organizationName) {
      form.setError('confirmText', {
        message: 'Confirmation text must match the organization name',
      });
      return;
    }

    setIsLoading(true);
    try {
      const result = await deleteOrganizationAction(data);

      if (result?.data?.success) {
        toast.success('Organization deleted successfully');
        setOpen(false);
        router.push('/');
      } else {
        toast.error(result?.data?.message || 'Failed to delete organization');
      }
    } catch (error) {
      console.error('Error deleting organization:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete organization');
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
            Delete Organization
          </DialogTitle>
          <DialogDescription>
            This action cannot be undone. This will permanently delete the organization and all its data.
          </DialogDescription>
        </DialogHeader>

        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            This will permanently delete the organization <strong>{organizationName}</strong>, 
            all team members, invitations, and associated data. This action cannot be undone.
          </AlertDescription>
        </Alert>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="confirmText"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type the organization name to confirm</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={organizationName}
                      {...field}
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
                onClick={() => {
                  setOpen(false);
                  form.reset();
                }}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={isLoading}
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Delete Organization Permanently
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

