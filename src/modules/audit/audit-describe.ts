/**
 * Turns an HTTP request into a structured, human-readable audit record.
 * The generic path handles every route automatically; OVERRIDES sharpen the
 * wording for the highest-value actions.
 */

export interface DescribeInput {
  method: string;
  routePath?: string; // matched pattern, e.g. '/vendors/:id/verify'
  path: string; // actual url
  params: Record<string, string>;
  body: unknown;
  actor: { id?: string; name?: string | null; roles?: string[] } | null;
  appHeader?: string;
}

export interface DescribedEvent {
  app: string;
  category: string;
  action: string;
  description: string;
  actorType: string;
  actorName: string | null;
  actorId: string | null;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
}

// Singular, human label for a URL resource segment.
const RESOURCE_LABEL: Record<string, string> = {
  vendors: 'washerman',
  reps: 'wash rep',
  'sales-rep': 'sales rep',
  orders: 'order',
  users: 'customer',
  teams: 'team',
  areas: 'area',
  companies: 'company',
  staff: 'staff member',
  catalogue: 'catalogue item',
  payments: 'payment',
  payouts: 'payout',
  referrals: 'referral',
  pricing: 'pricing',
  auth: 'account',
  upload: 'file',
  notifications: 'notification',
  wallet: 'wallet',
  disputes: 'dispute',
  blog: 'blog post',
  'platform-config': 'platform setting',
  admin: 'admin resource',
  assignment: 'assignment',
};

// Sub-action segment → past-tense verb phrase (object supplied by the resource).
const VERB_PHRASE: Record<string, string> = {
  verify: 'verified',
  reject: 'rejected',
  approve: 'approved',
  suspend: 'suspended',
  reactivate: 'reactivated',
  activate: 'activated',
  deactivate: 'deactivated',
  cancel: 'cancelled',
  complete: 'completed',
  accept: 'accepted',
  decline: 'declined',
  'clear-flag': 'cleared the review flag on',
  'garment-log': 'logged garments for',
  'upgrade-to-wash-rep': 'upgraded to wash rep',
  'revert-to-pending': 'reverted to pending',
  'sync-defaults': 'synced brand defaults for',
  reset: 'reset',
  read: 'marked read',
  'read-all': 'marked all read',
  fail: 'marked failed',
  request: 'requested',
  enroute: 'marked en route',
  'picked-up': 'marked picked up',
  'with-vendor': 'marked with the vendor',
  'in-progress': 'marked in progress',
  'ready-for-delivery': 'marked ready for delivery',
  'out-for-delivery': 'marked out for delivery',
  delivered: 'marked delivered',
  login: 'signed in',
  logout: 'signed out',
  register: 'registered',
  refresh: 'refreshed the session',
  'forgot-password': 'requested a password reset',
  'reset-password': 'reset the password',
};

const METHOD_VERB: Record<string, string> = {
  POST: 'created',
  PUT: 'updated',
  PATCH: 'updated',
  DELETE: 'deleted',
};

// Sensitive keys are never persisted, at any depth.
const SENSITIVE = new Set([
  'password', 'passwordhash', 'password_hash', 'newpassword', 'oldpassword',
  'otp', 'token', 'accesstoken', 'refreshtoken', 'secret', 'pin', 'cvv',
  'authorization', 'apikey', 'api_key', 'clientsecret', 'signature',
]);

const APP_ALLOW = new Set(['admin', 'vendor', 'rep', 'company', 'web', 'mobile', 'api', 'system']);

const ROLE_PRIORITY = [
  'admin', 'finance', 'dispute_resolver', 'company_owner', 'company_admin',
  'vendor', 'rep', 'sales_rep', 'washerman', 'team_owner', 'user',
];

const ROLE_TITLE: Record<string, string> = {
  admin: 'Admin', finance: 'Finance', dispute_resolver: 'Dispute resolver',
  company_owner: 'Company owner', company_admin: 'Company admin', vendor: 'Washerman',
  rep: 'Wash rep', sales_rep: 'Sales rep', washerman: 'Washerman', team_owner: 'Team owner',
  user: 'Customer', system: 'System', guest: 'Guest',
};

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value == null) return value ?? null;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE.has(k.toLowerCase()) ? '[redacted]' : redact(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 500) return value.slice(0, 500) + '…';
  return value;
}

export function primaryActorType(roles?: string[]): string {
  if (!roles || roles.length === 0) return 'guest';
  for (const r of ROLE_PRIORITY) if (roles.includes(r)) return r;
  return roles[0];
}
const actorTypeFromRoles = primaryActorType;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const shortId = (id?: string | null) => (id && UUID_RE.test(id) ? `#${id.slice(0, 8)}` : id ? `#${id}` : '');

function pickTargetId(params: Record<string, string>): string | null {
  const keys = ['id', 'userId', 'vendorId', 'orderId', 'repId', 'teamId', 'memberId', 'locationId', 'companyId'];
  for (const k of keys) if (params[k]) return params[k];
  const vals = Object.values(params ?? {});
  return vals.length ? vals[vals.length - 1] : null;
}

export function describeRequest(input: DescribeInput): DescribedEvent {
  const pattern = (input.routePath || input.path || '').replace(/^\/api\/v\d+/, '');
  const segments = pattern.split('/').filter(Boolean);
  const resource = segments[0] ?? 'root';
  const subActions = segments.slice(1).filter((s) => !s.startsWith(':'));
  const lastSub = subActions[subActions.length - 1];

  const actorType = actorTypeFromRoles(input.actor?.roles);
  const actorName = input.actor?.name ?? null;
  const actorId = input.actor?.id ?? null;
  const actorLabel = `${ROLE_TITLE[actorType] ?? 'Someone'}${actorName ? ` ${actorName}` : ''}`;

  const targetId = pickTargetId(input.params);
  const resourceLabel = RESOURCE_LABEL[resource] ?? resource.replace(/-/g, ' ');
  const category = (RESOURCE_LABEL[resource] ?? resource).split(' ')[0].replace(/s$/, '') || resource;

  const action = `${resource}.${subActions.join('.') || (METHOD_VERB[input.method] ?? input.method.toLowerCase())}`;

  // Verb: a named sub-action wins; otherwise the HTTP method's verb.
  const verb = (lastSub && VERB_PHRASE[lastSub]) || METHOD_VERB[input.method] || input.method.toLowerCase();

  // Build the sentence. Self-describing verbs (login/logout…) don't take an object.
  const selfVerbs = new Set(['signed in', 'signed out', 'registered', 'refreshed the session', 'requested a password reset', 'reset the password']);
  let description: string;
  if (lastSub && selfVerbs.has(VERB_PHRASE[lastSub] ?? '')) {
    description = `${actorLabel} ${verb}`;
  } else {
    const article = /^[aeiou]/i.test(resourceLabel) ? 'an' : 'a';
    const objectPhrase = METHOD_VERB[input.method] && !lastSub ? `${article} ${resourceLabel}` : resourceLabel;
    description = `${actorLabel} ${verb} ${objectPhrase}${targetId ? ` ${shortId(targetId)}` : ''}`.trim();
  }

  // App: trust the client header when valid, else infer from the actor.
  const header = (input.appHeader || '').toLowerCase();
  const app = APP_ALLOW.has(header)
    ? header
    : actorType === 'admin' || actorType === 'finance' ? 'admin'
    : actorType === 'vendor' ? 'vendor'
    : actorType === 'rep' || actorType === 'sales_rep' ? 'rep'
    : actorType === 'company_owner' || actorType === 'company_admin' ? 'company'
    : actorType === 'user' ? 'app'
    : 'api';

  return {
    app,
    category,
    action,
    description: capitalize(description),
    actorType,
    actorName,
    actorId,
    targetType: RESOURCE_LABEL[resource] ? resource : null,
    targetId,
    targetLabel: null,
  };
}

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
