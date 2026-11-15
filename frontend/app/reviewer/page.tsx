"use client";

import { StaffPage } from "../components/common/StaffPage";

// PLACEHOLDER: the read-only curriculum browser for reviewers is built in a later step.
export default function ReviewerHomePage() {
  return (
    <StaffPage roles={["reviewer", "cic_admin"]}>
      {() => (
        <>
          <h1 className="text-3xl">Curriculum</h1>
          <p className="mt-3 text-muted">
            Read-only curriculum browsing is coming in a later step. Reviewers never see student or class data.
          </p>
        </>
      )}
    </StaffPage>
  );
}
