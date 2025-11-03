'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Crown, Loader2, AlertTriangle } from 'lucide-react';

import { transferOwnershipAction } from '@/actions/team-actions';
import { TeamMember } from '@/actions/team-actions';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface TransferOwnershipDialogProps {
  member: TeamMember;
  organizationId: string;
  children: React.ReactNode;
}

export function TransferOwnershipDialog({ 
  member, 
  organizationId,
  children 
}: TransferOwnershipDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleTransfer = async () => {
    setIsLoading(true);
    try {
      const result = await transferOwnershipAction({
        newOwnerMemberId: member.id,
        organizationId,
      });

      if (result?.data?.success) {
        toast.success(result.data.message);
        setOpen(false);
        // Force page reload to refresh session with new role
        window.location.reload();
      } else {
        toast.error(result?.data?.message || 'Failed to transfer ownership');
      }
    } catch (error) {
      console.error('Error transferring ownership:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to transfer ownership');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <div onClick={(e) => {
        e.preventDefault();
        setOpen(true);
      }}>
        {children}
      </div>
      <AlertDialogContent className="sm:max-w-[500px]">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-orange-600">
            <Crown className="h-5 w-5" />
            Transfer Organization Ownership
          </AlertDialogTitle>
          <AlertDialogDescription>
            You are about to transfer ownership of this organization to another member.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            This action will make you an Admin and transfer full ownership to the selected member.
            You will lose the ability to delete the organization and manage certain settings.
          </AlertDescription>
        </Alert>

        <div className="border rounded-lg p-4 bg-muted/50">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarImage src={member.avatarUrl || ''} alt={member.name} />
              <AvatarFallback>
                {member.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h4 className="font-medium">{member.name}</h4>
              <p className="text-sm text-muted-foreground">{member.email}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Current role: {member.role}
              </p>
            </div>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleTransfer}
            disabled={isLoading}
            className="bg-orange-600 hover:bg-orange-700"
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Transfer Ownership
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

