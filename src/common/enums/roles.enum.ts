export enum Role {
  USER = 'user',
  COMPANY_OWNER = 'company_owner',  // Holds all veto rights on a company; set on activation
  COMPANY_ADMIN = 'company_admin',  // Promoted by the company owner; operational rights only
  TEAM_OWNER = 'team_owner',        // Creator of a team
  TEAM_ADMIN = 'team_admin',        // Promoted by the team owner
  WASHERMAN = 'washerman',
  REP = 'rep',                      // Platform field agent (logistics) — admin-created only
  VENDOR = 'vendor',                // Laundry operator — verified by admin before active
  ADMIN = 'admin',                  // Washermann platform admin; bypasses all company/team checks
  DISPUTE_RESOLVER = 'dispute_resolver',
  FINANCE = 'finance',
}
