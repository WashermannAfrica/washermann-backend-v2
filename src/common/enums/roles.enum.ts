export enum Role {
  USER = 'user',
  COMPANY_OWNER = 'company_owner',  // Holds all veto rights on a company; set on activation
  COMPANY_ADMIN = 'company_admin',  // Promoted by the company owner; operational rights only
  TEAM_OWNER = 'team_owner',        // Creator of a team
  TEAM_ADMIN = 'team_admin',        // Promoted by the team owner
  WASHERMAN = 'washerman',
  ADMIN = 'admin',                  // Washermann platform admin; bypasses all company/team checks
}
