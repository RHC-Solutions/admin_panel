import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import fs from "fs";
import path from "path";

const APPLICATIONS_FILE = path.join((process.env.SHARED_ROOT || process.cwd()), 'cms-data', 'applications.json');

// Defense-in-depth: /api/cms/* is already JWT+role gated in middleware, but this
// endpoint exposes/mutates applicant PII, so it re-checks admin in-handler too.
const requireAdmin = async (request: NextRequest) => {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  const role = String((token as any)?.role || '').toLowerCase();
  return ['admin', 'administrator', 'editor'].includes(role);
};

const loadApplications = () => {
  try {
    return JSON.parse(fs.readFileSync(APPLICATIONS_FILE, 'utf-8'));
  } catch (e) {
    return [];
  }
};

const saveApplications = (applications: any[]) => {
  fs.writeFileSync(APPLICATIONS_FILE, JSON.stringify(applications, null, 2));
  // Applicant PII — keep owner+group only (default umask would leave 644 on the
  // shared host). See CLAUDE.md permissions table.
  try { fs.chmodSync(APPLICATIONS_FILE, 0o660); } catch { /* best effort */ }
};

export async function GET(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const searchParams = request.nextUrl.searchParams;
    const jobId = searchParams.get('jobId');
    const status = searchParams.get('status');
    
    let applications = loadApplications();
    
    if (jobId) {
      applications = applications.filter((app: any) => app.jobId === jobId);
    }
    
    if (status) {
      applications = applications.filter((app: any) => app.status === status);
    }
    
    return NextResponse.json(applications);
  } catch (error) {
    console.error("Error fetching applications:", error);
    return NextResponse.json({ error: "Failed to fetch applications" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    const { applicationId, status } = body;
    
    if (!applicationId || !status) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    
    const applications = loadApplications();
    const index = applications.findIndex((app: any) => app.id === applicationId);
    
    if (index === -1) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }
    
    applications[index].status = status;
    saveApplications(applications);
    
    return NextResponse.json(applications[index]);
  } catch (error) {
    console.error("Error updating application:", error);
    return NextResponse.json({ error: "Failed to update application" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    const { applicationId } = body;
    
    if (!applicationId) {
      return NextResponse.json({ error: "Missing applicationId" }, { status: 400 });
    }
    
    let applications = loadApplications();
    applications = applications.filter((app: any) => app.id !== applicationId);
    saveApplications(applications);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting application:", error);
    return NextResponse.json({ error: "Failed to delete application" }, { status: 500 });
  }
}
