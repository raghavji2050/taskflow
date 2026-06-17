let meetingInProgress = false;

export function setMomMeetingInProgress(active: boolean) {
  meetingInProgress = active;
}

export function isMomMeetingInProgress() {
  return meetingInProgress;
}

const LEAVE_MESSAGE =
  "A meeting is in progress. Leave anyway? Your MoM draft will be lost unless you save it first.";

export function confirmLeaveActiveMomMeeting(): boolean {
  if (!meetingInProgress) return true;
  return window.confirm(LEAVE_MESSAGE);
}

export const MOM_MEETING_CLOSE_MESSAGE =
  "The meeting timer is still running. Pause it or save the MoM before closing? Your draft will be discarded.";
