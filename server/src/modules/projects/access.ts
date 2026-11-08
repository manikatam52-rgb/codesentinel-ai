import type { Role } from '@prisma/client';
import { db } from '../../lib/db';
import { ForbiddenError, NotFoundError } from '../../lib/errors';

export interface ProjectContext {
  projectId: string;
  orgId: string;
  role: Role;
  repoOwner: string;
  repoName: string;
  defaultBranch: string;
  userId: string;
}

/** Resolves a project and asserts the requesting user's membership + role. */
export async function resolveProjectAccess(
  userId: string,
  projectId: string,
  minRoles: Role[] = ['OWNER', 'ADMIN', 'DEVELOPER', 'VIEWER'],
): Promise<ProjectContext> {
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) throw NotFoundError('Project not found');

  const membership = await db.membership.findUnique({
    where: { userId_orgId: { userId, orgId: project.orgId } },
  });
  if (!membership) throw ForbiddenError('You do not have access to this project');
  if (!minRoles.includes(membership.role)) {
    throw ForbiddenError(`Requires one of roles: ${minRoles.join(', ')}`);
  }

  return {
    projectId: project.id,
    orgId: project.orgId,
    role: membership.role,
    repoOwner: project.repoOwner,
    repoName: project.repoName,
    defaultBranch: project.defaultBranch,
    userId,
  };
}

/** Resolves org access for a user, returning role. */
export async function resolveOrgRole(userId: string, orgId: string): Promise<Role> {
  const membership = await db.membership.findUnique({
    where: { userId_orgId: { userId, orgId } },
  });
  if (!membership) throw ForbiddenError('You do not have access to this organization');
  return membership.role;
}
