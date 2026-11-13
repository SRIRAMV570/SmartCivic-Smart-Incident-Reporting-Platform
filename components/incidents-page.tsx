"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import NotificationsPanel from "@/components/notifications-panel";
import IncidentSearch from "@/components/incident-search";

type Officer = {
  user_id: number;
  full_name: string;
  department_id: number | string;
  department_name: string;
  is_active: boolean;
};

type Incident = {
  incident_id: number;
  title: string;
  description?: string;
  category_name?: string;
  department_id?: number | string;
  department_name?: string;
  location?: string;
  priority?: string;
  status: string;
  is_assigned?: boolean;
  assigned_officers?: string[];
  reported_by_name?: string;
  created_at?: string;
};

export default function IncidentsClientPage() {
  const router = useRouter();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [officerIds, setOfficerIds] = useState<string[]>([]);
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [selectedIncident, setSelectedIncident] = useState("");
  const [assignMessage, setAssignMessage] = useState("");
  const [updatingIncidentId, setUpdatingIncidentId] = useState<number | null>(null);

  useEffect(() => {
    async function loadOfficers() {
      try {
        const response = await fetch("/api/officers");
        if (response.status === 401) {
          router.replace("/admin/login");
          return;
        }
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.message || "Failed to load officers.");
        }

        setOfficers(data.officers);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load officers.");
      }
    }

    loadOfficers();
  }, [router]);

  async function assignOfficer() {
    if (!selectedIncident || officerIds.length === 0) {
      setAssignMessage("Select a pending incident and at least one officer.");
      return;
    }
    const incidentIdToAssign = Number(selectedIncident);
    const chosenOfficers = officers.filter((officer) =>
      officerIds.includes(String(officer.user_id))
    );

    try {
      setAssignMessage("Assigning officer...");

      const response = await fetch("/api/assignments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          incident_id: incidentIdToAssign,
          officer_ids: officerIds.map(Number),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Assignment failed.");
      }

      // Immediately clear selection and update local incident state
      // so the newly assigned incident immediately vanishes from the dropdown
      setSelectedIncident("");
      setOfficerIds([]);
      setAssignMessage(
        `Successfully assigned #${incidentIdToAssign} to ${chosenOfficers
          .map((officer) => officer.full_name)
          .join(", ")}.`
      );

      setIncidents((current) =>
        current.map((inc) =>
          inc.incident_id === incidentIdToAssign
            ? {
                ...inc,
                status: "assigned",
                is_assigned: true,
                assigned_officers: chosenOfficers.map((officer) => officer.full_name),
              }
            : inc
        )
      );

      const refresh = await fetch("/api/incidents");
      const refreshedData = await refresh.json();

      if (refresh.ok && refreshedData.success) {
        setIncidents(refreshedData.incidents);
      }
    } catch (err) {
      setAssignMessage(
        err instanceof Error ? err.message : "Assignment failed."
      );
    }
  }

  async function updateIncidentStatus(incidentId: number, status: string) {
    setUpdatingIncidentId(incidentId);
    setAssignMessage("");

    try {
      const response = await fetch(`/api/incidents/status?id=${incidentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to update incident status.");
      }

      // If resolved or rejected, filter out; otherwise update status
      setIncidents((current) =>
        status === "resolved" || status === "rejected"
          ? current.filter((incident) => incident.incident_id !== incidentId)
          : current.map((incident) =>
              incident.incident_id === incidentId
                ? { ...incident, status }
                : incident
            )
      );

      if (
        (status === "resolved" || status === "rejected") &&
        selectedIncident === String(incidentId)
      ) {
        setSelectedIncident("");
        setOfficerIds([]);
      }

      setAssignMessage(`Incident #${incidentId} marked ${status.replace("_", " ")}.`);
    } catch (err) {
      setAssignMessage(
        err instanceof Error ? err.message : "Unable to update incident status."
      );
    } finally {
      setUpdatingIncidentId(null);
    }
  }

  useEffect(() => {
    let sessionExpired = false;

    async function loadIncidents() {
      if (sessionExpired) return;

      try {
        const incidentsResponse = await fetch("/api/incidents", {
          cache: "no-store",
        });
        if (incidentsResponse.status === 401) {
          sessionExpired = true;
          if (refreshTimer !== undefined) window.clearInterval(refreshTimer);
          router.replace("/admin/login");
          return;
        }
        const incidentsData = await incidentsResponse.json();

        if (!incidentsResponse.ok || !incidentsData.success) {
          throw new Error(incidentsData.message || "Failed to load incidents.");
        }

        setIncidents(incidentsData.incidents);
        setError("");
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Something went wrong."
        );
      } finally {
        setLoading(false);
      }
    }

    void loadIncidents();
    const refreshTimer = window.setInterval(() => void loadIncidents(), 10000);
    return () => {
      window.clearInterval(refreshTimer);
    };
  }, [router]);

  // Strictly filter only pending AND unassigned incidents.
  // Assigned, in_progress, resolved, and rejected incidents are excluded from assignment choice.
  const pendingIncidents = incidents.filter(
    (incident) =>
      incident.status?.toLowerCase().trim() === "pending" &&
      !incident.is_assigned
  );

  const selectedIncidentRecord = pendingIncidents.find(
    (incident) => String(incident.incident_id) === selectedIncident
  );

  const availableOfficers = selectedIncidentRecord
    ? officers.filter(
        (officer) =>
          officer.is_active &&
          String(officer.department_id) ===
            String(selectedIncidentRecord.department_id)
      )
    : [];

  return (
    <main className="min-h-screen bg-gray-100 p-6 text-gray-900 md:p-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Incident Management</h1>
          <p className="mt-2 text-gray-600">
            View, track, and assign reported civic incidents to field officers.
          </p>
        </div>

        <NotificationsPanel />
        <IncidentSearch />

        {/* Assign Incident Section */}
        <div className="mb-6 rounded-xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Assign Incident to Officer</h2>
              <p className="mt-1 text-sm text-gray-600">
                Select one or more active officers for an unassigned pending incident. Other statuses are excluded.
              </p>
            </div>
            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
              {pendingIncidents.length} pending to assign
            </span>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-medium">
                Select Pending Incident
              </label>
              <select
                value={selectedIncidentRecord ? selectedIncident : ""}
                onChange={(e) => {
                  const incidentId = e.target.value;
                  setSelectedIncident(incidentId);
                  setOfficerIds([]);
                }}
                className="w-full rounded-lg border p-3 bg-white"
              >
                <option value="">
                  {pendingIncidents.length === 0
                    ? "No pending unassigned incidents"
                    : "Choose an incident"}
                </option>
                {pendingIncidents.map((incident) => (
                  <option
                    key={incident.incident_id}
                    value={incident.incident_id}
                  >
                    #{incident.incident_id} — {incident.title} ({incident.department_name || "Department"})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                Select Officers (choose one or more)
              </label>
              <div
                className="max-h-44 space-y-2 overflow-y-auto rounded-lg border p-3"
                aria-disabled={!selectedIncidentRecord}
              >
                {!selectedIncidentRecord ? (
                  <p className="text-sm text-gray-500">Choose an incident first.</p>
                ) : availableOfficers.length === 0 ? (
                  <p className="text-sm text-gray-500">No officers in this department.</p>
                ) : (
                  availableOfficers.map((officer) => (
                    <label key={officer.user_id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={officerIds.includes(String(officer.user_id))}
                        onChange={(event) =>
                          setOfficerIds((current) =>
                            event.target.checked
                              ? [...current, String(officer.user_id)]
                              : current.filter((id) => id !== String(officer.user_id))
                          )
                        }
                      />
                      <span>{officer.full_name} — {officer.department_name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>

            <div className="flex items-end">
              <button
                onClick={assignOfficer}
                disabled={
                  loading || !selectedIncidentRecord || !officerIds.length
                }
                className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition"
              >
                Assign selected officers ({officerIds.length})
              </button>
            </div>
          </div>

          {assignMessage && (
            <p className="mt-4 text-sm font-medium text-blue-700 bg-blue-50 p-2.5 rounded-lg border border-blue-200" role="status">
              {assignMessage}
            </p>
          )}
        </div>

        <div className="mb-6 rounded-xl border bg-white p-5 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Active incidents needing attention</p>
            <p className="mt-1 text-3xl font-bold">{incidents.length}</p>
          </div>
          <Link
            href="/admin/feedback"
            className="rounded-lg bg-gray-50 border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            View Citizen Feedback & Complaints →
          </Link>
        </div>

        {loading ? (
          <p>Loading incidents...</p>
        ) : error ? (
          <p className="rounded-lg bg-red-50 p-4 text-red-700">
            Error: {error}
          </p>
        ) : incidents.length === 0 ? (
          <p className="rounded-lg bg-white p-6 text-gray-600">
            No active incidents found.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
            <table className="incident-data-table w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="p-4">ID</th>
                  <th className="p-4">Incident</th>
                  <th className="p-4">Category</th>
                  <th className="p-4">Department</th>
                  <th className="p-4">Assigned officers</th>
                  <th className="p-4">Location</th>
                  <th className="p-4">Priority</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Update status</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((incident) => (
                  <tr
                    key={incident.incident_id}
                    className="border-t hover:bg-gray-50"
                  >
                    <td className="p-4">{incident.incident_id}</td>
                    <td className="p-4 font-medium">{incident.title}</td>
                    <td className="p-4">
                      {incident.category_name || "—"}
                    </td>
                    <td className="p-4">
                      {incident.department_name || "—"}
                    </td>
                    <td className="p-4">
                      {incident.assigned_officers?.length
                        ? incident.assigned_officers.join(", ")
                        : "Unassigned"}
                    </td>
                    <td className="p-4">{incident.location || "—"}</td>
                    <td className="p-4 capitalize">
                      {incident.priority || "—"}
                    </td>
                    <td className="p-4">
                      <span className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${
                        incident.status === "pending"
                          ? "bg-amber-100 text-amber-800"
                          : incident.status === "assigned"
                            ? "bg-blue-100 text-blue-800"
                            : incident.status === "in_progress"
                              ? "bg-purple-100 text-purple-800"
                              : "bg-gray-100 text-gray-800"
                      }`}>
                        {incident.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="p-4">
                      <select
                        aria-label={`Update status for incident ${incident.incident_id}`}
                        value={incident.status}
                        disabled={updatingIncidentId === incident.incident_id}
                        onChange={(event) =>
                          void updateIncidentStatus(
                            incident.incident_id,
                            event.target.value
                          )
                        }
                        className="rounded-lg border p-2 bg-white"
                      >
                        <option value="pending">Pending</option>
                        <option value="assigned">Assigned</option>
                        <option value="in_progress">In progress</option>
                        <option value="resolved">Resolved</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
