export enum TeamMemberRole {
  OWNER = 'owner', // Team creator; full control including deletion and ownership transfer
  ADMIN = 'admin', // Promoted by the owner; can manage members but cannot delete the team
  MEMBER = 'member', // Regular team member
}
