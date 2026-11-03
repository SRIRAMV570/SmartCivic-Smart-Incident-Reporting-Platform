"use client";

import { useCallback, useEffect, useState } from "react";

type Incident = {
  incident_id: number;
  title: string;
  description: string;
  location: string;
  priority: string;
  status: string;
  category_name: string;
  department_name: string;
  reported_by: string;
  created_at: string;
};

type OfficerAccount = {
  full_name: string;
  department_name: string | null;
  is_manager: boolean;
};

const statuses = ["pending", "assigned", "in_progress", "resolved"];

export default function OfficerPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [account, setAccount] = useState<OfficerAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadPortal = useCallback(async () => {
    const [incidentsResponse, accountResponse] = await Promise.all([
      fetch("/api/incidents", { cache: "no-store" }),
      fetch("/api/auth/me", { cache: "no-store" }),
    ]);
    const [incidentsData, accountData] = await Promise.all([
      incidentsResponse.json(),
      accountResponse.json(),
    ]);

    if (!incidentsResponse.ok || !incidentsData.success) {
      throw new Error(incidentsData.message || "Unable to load assigned incidents.");
    }
    if (!accountResponse.ok || !accountData.success) {
      throw new Error(accountData.message || "Unable to load officer details.");
    }

    setIncidents(incidentsData.incidents);
    setAccount({
      ...accountData.account,
      department_name: accountData.account.department_name,
      is_manager: accountData.account.is_manager,
    });
  }, []);

  useEffect(() => {
    async function initialize() {
      try {
        await loadPortal();
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load the officer portal."
        );
      } finally {
        setLoading(false);
      }
    }

    void initialize();
    const refreshTimer = window.setInterval(() => {
      void loadPortal().catch((loadError: unknown) => {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to refresh assigned incidents."
        );
      });
    }, 10000);

    return () => window.clearInterval(refreshTimer);
  }, [loadPortal]);

  async function updateStatus(incidentId: number, status: string) {
    setUpdatingId(incidentId);
    setError("");
    setNotice("");

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

      setIncidents((current) =>
        status === "resolved"
          ? current.filter((incident) => incident.incident_id !== incidentId)
          : current.map((incident) =>
              incident.incident_id === incidentId
                ? { ...incident, status: data.new_status ?? status }
                : incident
            )
      );
      setNotice(`Incident #${incidentId} status updated. The administrator can see this change in activity history.`);
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Unable to update incident status."
      );
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-gray-100 p-6 text-gray-900 md:p-10">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
            {account?.department_name ?? "Department"} / Officer Portal
          </p>
          <h1 className="mt-2 text-3xl font-bold">
            Welcome, {account?.full_name ?? "Officer"}
          </h1>
          <p className="mt-2 text-gray-600">
            {account?.is_manager
              ? "Manager view: incidents assigned in your department."
              : "Review incidents assigned to you and update their status."}
          </p>
        </header>

        {error && (
          <p className="mb-5 rounded-lg bg-red-50 p-4 text-red-700" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="mb-5 rounded-lg bg-green-50 p-4 text-green-800" role="status">
            {notice}
          </p>
        )}
        <section className="mb-6 rounded-xl border bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Incidents available</p>
          <p className="mt-2 text-3xl font-bold">{loading ? "—" : incidents.length}</p>
        </section>

        {loading ? (
          <p>Loading assigned incidents...</p>
        ) : incidents.length === 0 ? (
          <p className="rounded-lg bg-white p-6 text-gray-600">
            No incidents are assigned to your account yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
            <table className="incident-data-table w-full table-fixed text-left text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="w-[6%] p-3 md:p-4">ID</th>
                  <th className="w-[34%] p-3 md:p-4">Incident</th>
                  <th className="w-[13%] p-3 md:p-4">Category</th>
                  <th className="w-[17%] p-3 md:p-4">Location</th>
                  <th className="w-[8%] p-3 md:p-4">Priority</th>
                  <th className="w-[10%] p-3 md:p-4">Status</th>
                  <th className="w-[12%] p-3 md:p-4">Update status</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((incident) => (
                  <tr className="border-t" key={incident.incident_id}>
                    <td className="break-words p-3 align-top md:p-4">{incident.incident_id}</td>
                    <td className="break-words p-3 align-top md:p-4">
                      <strong className="whitespace-normal">{incident.title}</strong>
                      <p className="mt-1 whitespace-normal break-words text-gray-600 [overflow-wrap:anywhere]">
                        {incident.description}
                      </p>
                    </td>
                    <td className="break-words p-3 align-top md:p-4">{incident.category_name}</td>
                    <td className="break-words p-3 align-top md:p-4">
                      {incident.location}
                    </td>
                    <td className="break-words p-3 align-top capitalize md:p-4">{incident.priority}</td>
                    <td className="break-words p-3 align-top capitalize md:p-4">{incident.status.replace("_", " ")}</td>
                    <td className="p-3 align-top md:p-4">
                      <select
                        aria-label={`Update status for incident ${incident.incident_id}`}
                        className="max-w-full rounded-lg border p-2"
                        disabled={updatingId === incident.incident_id}
                        value={incident.status}
                        onChange={(event) =>
                          void updateStatus(incident.incident_id, event.target.value)
                        }
                      >
                        {statuses.map((status) => (
                          <option key={status} value={status}>
                            {status.replace("_", " ")}
                          </option>
                        ))}
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
