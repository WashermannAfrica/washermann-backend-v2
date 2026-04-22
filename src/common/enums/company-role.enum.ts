export enum CompanyRole {
  OWNER = 'owner', // Set once on activation; holds veto rights and cannot be removed by any admin
  ADMIN = 'admin', // Operational admin; granted/revoked by the owner
}
