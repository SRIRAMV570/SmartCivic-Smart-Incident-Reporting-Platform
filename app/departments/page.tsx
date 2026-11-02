
"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";

type Department = {
  department_id: number;
  department_name: string;
  total_incidents: number;
  open_incidents: number;
  resolved_incidents: number;
  officer_count: number;
  manager_name: string | null;
  manager_email: string | null;
  manager_has_login: boolean;
};

type Officer = {
  user_id: number;
  full_name: string;
  department_id: number | string;
  department_name: string;
  is_manager: boolean;
  email: string | null;
};

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newDepartmentName, setNewDepartmentName] = useState("");
  const [managerName, setManagerName] = useState("");
  const [managerEmail, setManagerEmail] = useState("");
  const [managerPassword, setManagerPassword] = useState("");
  const [officerDepartmentId, setOfficerDepartmentId] = useState("");
  const [officerName, setOfficerName] = useState("");
  const [officerEmail, setOfficerEmail] = useState("");
  const [officerPassword, setOfficerPassword] = useState("");
  const [officerIsManager, setOfficerIsManager] = useState(false);
  const [editingOfficerId, setEditingOfficerId] = useState<number | null>(null);
  const [editingOfficerName, setEditingOfficerName] = useState("");
  const [editingOfficerEmail, setEditingOfficerEmail] = useState("");
  const [editingOfficerPassword, setEditingOfficerPassword] = useState("");
  const [editingDepartmentId, setEditingDepartmentId] = useState<number | null>(
    null
  );
  const [editingDepartmentName, setEditingDepartmentName] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveDepartment(
    method: "POST" | "PATCH",
    values: {
      department_name: string;
      department_id?: number;
      manager_name?: string;
      manager_email?: string;
      manager_password?: string;
    }
  ) {
    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/departments", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to save department.");
      }

      if (method === "POST") {
        setNewDepartmentName("");
        setManagerName("");
        setManagerEmail("");
        setManagerPassword("");
      } else {
        setEditingDepartmentId(null);
        setEditingDepartmentName("");
      }

      const refresh = await fetch("/api/departments");
      const refreshData = await refresh.json();
      if (!refresh.ok || !refreshData.success) {
        throw new Error(refreshData.message || "Unable to refresh departments.");
      }
      setDepartments(refreshData.departments);
      if (!officerDepartmentId && refreshData.departments.length) {
        setOfficerDepartmentId(String(refreshData.departments[0].department_id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save department.");
    } finally {
      setSaving(false);
    }
  }

  async function addOfficer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/officers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          department_id: Number(officerDepartmentId),
          full_name: officerName,
          email: officerEmail,
          password: officerPassword,
          is_manager: officerIsManager,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to create officer account.");
      }

      setOfficerName("");
      setOfficerEmail("");
      setOfficerPassword("");
      setOfficerIsManager(false);
      const refresh = await fetch("/api/departments", { cache: "no-store" });
      const refreshData = await refresh.json();
      if (!refresh.ok || !refreshData.success) {
        throw new Error(refreshData.message || "Unable to refresh departments.");
      }
      setDepartments(refreshData.departments);
      await loadOfficers();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to create officer account."
      );
    } finally {
      setSaving(false);
    }
  }

  async function loadOfficers() {
    const response = await fetch("/api/officers", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.message || "Unable to load officer accounts.");
    }
    setOfficers(data.officers);
  }

  async function saveOfficerCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editingOfficerId === null) return;

    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/officers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: editingOfficerId,
          full_name: editingOfficerName,
          email: editingOfficerEmail,
          password: editingOfficerPassword,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to update officer credentials.");
      }

      setEditingOfficerId(null);
      setEditingOfficerPassword("");
      await loadOfficers();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to update officer credentials."
      );
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    async function loadDepartments() {
      try {
        const [response, officersResponse] = await Promise.all([
          fetch("/api/departments"),
          fetch("/api/officers", { cache: "no-store" }),
        ]);
        const data = await response.json();
        const officersData = await officersResponse.json();

        if (!response.ok || !data.success) {
          throw new Error(data.message || "Unable to load departments.");
        }
        if (!officersResponse.ok || !officersData.success) {
          throw new Error(
            officersData.message || "Unable to load officer accounts."
          );
        }

        setDepartments(data.departments);
        setOfficers(officersData.officers);
        if (data.departments.length) {
          setOfficerDepartmentId(String(data.departments[0].department_id));
          setOfficerIsManager(!data.departments[0].manager_has_login);
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load departments."
        );
      } finally {
        setLoading(false);
      }
    }

    void loadDepartments();
  }, []);

  const totalIncidents = departments.reduce(
    (sum, department) => sum + department.total_incidents,
    0
  );

  const totalOpen = departments.reduce(
    (sum, department) => sum + department.open_incidents,
    0
  );

  const totalResolved = departments.reduce(
    (sum, department) => sum + department.resolved_incidents,
    0
  );

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "40px",
        background: "#f4f6fb",
        color: "#182238",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "20px",
          flexWrap: "wrap",
          marginBottom: "32px",
        }}
      >
        <div>
          <p style={{ color: "#5b50ef", fontWeight: 700 }}>
            SMARTCIVIC / WORKSPACE
          </p>
          <h1 style={{ fontSize: "32px", margin: "8px 0" }}>
            Department Management
          </h1>
          <p style={{ color: "#7c879e" }}>
            Monitor department workloads and incident resolution.
          </p>
        </div>

        <Link
          href="/admin/incidents"
          style={{
            padding: "12px 18px",
            background: "#5145ed",
            color: "#fff",
            borderRadius: "10px",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          ← Incident management
        </Link>
      </header>

      {error && (
        <p
          role="alert"
          style={{
            background: "#fff0f0",
            color: "#b42318",
            padding: "16px",
            borderRadius: "10px",
          }}
        >
          {error}
        </p>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void saveDepartment("POST", {
            department_name: newDepartmentName,
            manager_name: managerName,
            manager_email: managerEmail,
            manager_password: managerPassword,
          });
        }}
        style={{
          display: "flex",
          gap: "12px",
          flexWrap: "wrap",
          padding: "20px",
          marginBottom: "24px",
          border: "1px solid #e5e9f2",
          borderRadius: "14px",
          background: "#fff",
        }}
      >
        <label
          htmlFor="new-department"
          style={{ alignSelf: "center", fontWeight: 650 }}
        >
          Add a department
        </label>
        <input
          id="new-department"
          value={newDepartmentName}
          onChange={(event) => setNewDepartmentName(event.target.value)}
          maxLength={120}
          required
          placeholder="Department name"
          style={{
            flex: "1 1 220px",
            minWidth: 0,
            padding: "11px 12px",
            border: "1px solid #dfe3ed",
            borderRadius: "8px",
          }}
        />
        <input
        value={managerName}
        onChange={(event) => setManagerName(event.target.value)}
        minLength={2}
        maxLength={100}
        required
        placeholder="Manager full name"
        aria-label="Manager full name"
        style={{
          flex: "1 1 180px",
          minWidth: 0,
          padding: "11px 12px",
          border: "1px solid #dfe3ed",
          borderRadius: "8px",
        }}
        />
        <input
        value={managerEmail}
        onChange={(event) => setManagerEmail(event.target.value)}
        type="email"
        maxLength={254}
        required
        placeholder="Manager email"
        aria-label="Manager email"
        style={{
          flex: "1 1 180px",
          minWidth: 0,
          padding: "11px 12px",
          border: "1px solid #dfe3ed",
          borderRadius: "8px",
        }}
        />
        <input
        value={managerPassword}
        onChange={(event) => setManagerPassword(event.target.value)}
        type="password"
        minLength={8}
        maxLength={72}
        required
        placeholder="Manager password"
        aria-label="Manager password"
        autoComplete="new-password"
        style={{
          flex: "1 1 180px",
          minWidth: 0,
          padding: "11px 12px",
          border: "1px solid #dfe3ed",
          borderRadius: "8px",
        }}
        />
        <button
          type="submit"
          disabled={saving}
          style={{
            padding: "11px 16px",
            border: 0,
            borderRadius: "8px",
            background: "#5145ed",
            color: "white",
            fontWeight: 650,
            cursor: saving ? "wait" : "pointer",
          }}
        >
          {saving ? "Saving..." : "Add department"}
        </button>
        <p style={{ flexBasis: "100%", margin: 0, color: "#7c879e", fontSize: "13px" }}>
          Each new department requires a manager login. Passwords are stored as hashes, not plaintext.
        </p>
      </form>

      <form
        onSubmit={(event) => void addOfficer(event)}
        style={{
          display: "flex",
          gap: "12px",
          flexWrap: "wrap",
          padding: "20px",
          marginBottom: "24px",
          border: "1px solid #e5e9f2",
          borderRadius: "14px",
          background: "#fff",
        }}
      >
        <label htmlFor="officer-department" style={{ alignSelf: "center", fontWeight: 650 }}>
          Add department officer
        </label>
        <select
          id="officer-department"
          value={officerDepartmentId}
          onChange={(event) => {
            setOfficerDepartmentId(event.target.value);
            const department = departments.find(
              (item) => String(item.department_id) === event.target.value
            );
            setOfficerIsManager(Boolean(department && !department.manager_has_login));
          }}
          required
          style={{ flex: "1 1 180px", padding: "11px 12px", border: "1px solid #dfe3ed", borderRadius: "8px" }}
        >
          <option value="">Choose a department</option>
          {departments.map((department) => (
            <option key={department.department_id} value={department.department_id}>
              {department.department_name}
            </option>
          ))}
        </select>
        <select
          aria-label="Officer account type"
          value={officerIsManager ? "manager" : "officer"}
          onChange={(event) => setOfficerIsManager(event.target.value === "manager")}
          style={{ flex: "1 1 160px", padding: "11px 12px", border: "1px solid #dfe3ed", borderRadius: "8px" }}
        >
          <option value="officer">Additional officer</option>
          <option
            value="manager"
            disabled={
              departments.find(
                (item) => String(item.department_id) === officerDepartmentId
              )?.manager_has_login
            }
          >
            Set manager login
          </option>
        </select>
        <input
          value={officerName}
          onChange={(event) => setOfficerName(event.target.value)}
          minLength={2}
          maxLength={100}
          required
          placeholder={officerIsManager ? "Manager name" : "Officer name"}
          aria-label={officerIsManager ? "Manager name" : "Officer name"}
          style={{ flex: "1 1 180px", minWidth: 0, padding: "11px 12px", border: "1px solid #dfe3ed", borderRadius: "8px" }}
        />
        <input
          value={officerEmail}
          onChange={(event) => setOfficerEmail(event.target.value)}
          type="email"
          maxLength={254}
          required
          placeholder="Officer email"
          aria-label="Officer email"
          style={{ flex: "1 1 180px", minWidth: 0, padding: "11px 12px", border: "1px solid #dfe3ed", borderRadius: "8px" }}
        />
        <input
          value={officerPassword}
          onChange={(event) => setOfficerPassword(event.target.value)}
          type="password"
          minLength={8}
          maxLength={72}
          required
          placeholder="Temporary password"
          aria-label="Officer password"
          autoComplete="new-password"
          style={{ flex: "1 1 180px", minWidth: 0, padding: "11px 12px", border: "1px solid #dfe3ed", borderRadius: "8px" }}
        />
        <button
          type="submit"
          disabled={saving || !departments.length}
          style={{ padding: "11px 16px", border: 0, borderRadius: "8px", background: "#1d4ed8", color: "white", fontWeight: 650, cursor: saving ? "wait" : "pointer" }}
        >
          {saving ? "Saving..." : officerIsManager ? "Set manager login" : "Add officer"}
        </button>
        <p style={{ flexBasis: "100%", margin: 0, color: "#7c879e", fontSize: "13px" }}>
          Existing departments without a manager login can be configured here. Add as many officers as needed.
        </p>
      </form>

      <section
        style={{
          background: "#fff",
          border: "1px solid #e5e9f2",
          borderRadius: "16px",
          overflowX: "auto",
          marginBottom: "28px",
        }}
      >
        <div style={{ padding: "24px 24px 12px" }}>
          <h2 style={{ margin: "0 0 8px", fontSize: "21px" }}>
            Officer accounts
          </h2>
          <p style={{ color: "#7c879e", margin: 0 }}>
            Update an officer’s name or email, or set a new password. Leave the password blank to keep it unchanged.
          </p>
        </div>
        {loading ? (
          <p style={{ padding: "24px" }}>Loading officer accounts...</p>
        ) : officers.length === 0 ? (
          <p style={{ padding: "24px" }}>No officer accounts found.</p>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              textAlign: "left",
              minWidth: "760px",
            }}
          >
            <thead style={{ background: "#f8f9fc" }}>
              <tr>
                {["Officer", "Department", "Email", "Account"].map((heading) => (
                  <th
                    key={heading}
                    style={{
                      padding: "16px 20px",
                      color: "#78849b",
                      fontSize: "12px",
                      textTransform: "uppercase",
                      borderBottom: "1px solid #e5e9f2",
                    }}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {officers.map((officer) => (
                <tr key={officer.user_id}>
                  <td style={{ padding: "16px 20px", borderBottom: "1px solid #edf0f6" }}>
                    {editingOfficerId === officer.user_id ? (
                      <form onSubmit={saveOfficerCredentials} id={`officer-edit-${officer.user_id}`}>
                        <input
                          value={editingOfficerName}
                          onChange={(event) => setEditingOfficerName(event.target.value)}
                          minLength={2}
                          maxLength={100}
                          required
                          aria-label="Officer full name"
                          style={{ width: "100%", padding: "8px", border: "1px solid #dfe3ed", borderRadius: "7px" }}
                        />
                      </form>
                    ) : (
                      <>
                        <strong>{officer.full_name}</strong>
                        {officer.is_manager && (
                          <div style={{ color: "#5b50ef", fontSize: "12px" }}>Department manager</div>
                        )}
                      </>
                    )}
                  </td>
                  <td style={{ padding: "16px 20px", borderBottom: "1px solid #edf0f6" }}>
                    {officer.department_name}
                  </td>
                  <td style={{ padding: "16px 20px", borderBottom: "1px solid #edf0f6" }}>
                    {editingOfficerId === officer.user_id ? (
                      <>
                        <input
                          form={`officer-edit-${officer.user_id}`}
                          value={editingOfficerEmail}
                          onChange={(event) => setEditingOfficerEmail(event.target.value)}
                          type="email"
                          maxLength={254}
                          required
                          aria-label="Officer email"
                          style={{ width: "100%", padding: "8px", border: "1px solid #dfe3ed", borderRadius: "7px" }}
                        />
                        <input
                          form={`officer-edit-${officer.user_id}`}
                          value={editingOfficerPassword}
                          onChange={(event) => setEditingOfficerPassword(event.target.value)}
                          type="password"
                          minLength={8}
                          maxLength={72}
                          autoComplete="new-password"
                          placeholder="New password (optional)"
                          aria-label="New officer password"
                          style={{ width: "100%", marginTop: "8px", padding: "8px", border: "1px solid #dfe3ed", borderRadius: "7px" }}
                        />
                      </>
                    ) : (
                      officer.email ?? "No login email"
                    )}
                  </td>
                  <td style={{ padding: "16px 20px", borderBottom: "1px solid #edf0f6" }}>
                    {editingOfficerId === officer.user_id ? (
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          type="submit"
                          form={`officer-edit-${officer.user_id}`}
                          disabled={saving}
                        >
                          {saving ? "Saving..." : "Save"}
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => {
                            setEditingOfficerId(null);
                            setEditingOfficerPassword("");
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingOfficerId(officer.user_id);
                          setEditingOfficerName(officer.full_name);
                          setEditingOfficerEmail(officer.email ?? "");
                          setEditingOfficerPassword("");
                        }}
                      >
                        Edit credentials
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: "18px",
          marginBottom: "28px",
        }}
      >
        {[
          {
            label: "Total departments",
            value: departments.length,
            color: "#5145ed",
          },
          {
            label: "Total incidents",
            value: totalIncidents,
            color: "#2563eb",
          },
          {
            label: "Open incidents",
            value: totalOpen,
            color: "#d97706",
          },
          {
            label: "Resolved incidents",
            value: totalResolved,
            color: "#059669",
          },
        ].map((stat) => (
          <article
            key={stat.label}
            style={{
              background: "#fff",
              border: "1px solid #e5e9f2",
              borderRadius: "16px",
              padding: "24px",
            }}
          >
            <p style={{ color: "#7c879e", margin: 0 }}>{stat.label}</p>
            <p
              style={{
                fontSize: "32px",
                fontWeight: 750,
                color: stat.color,
                margin: "18px 0 0",
              }}
            >
              {loading ? "—" : stat.value}
            </p>
          </article>
        ))}
      </section>

      <section
        style={{
          background: "#fff",
          border: "1px solid #e5e9f2",
          borderRadius: "16px",
          overflowX: "auto",
        }}
      >
        <div style={{ padding: "24px 24px 12px" }}>
          <h2 style={{ margin: "0 0 8px", fontSize: "21px" }}>
            All departments
          </h2>
          <p style={{ color: "#7c879e", margin: 0 }}>
            Live department statistics retrieved from PostgreSQL.
          </p>
        </div>

        {loading ? (
          <p style={{ padding: "24px" }}>Loading departments...</p>
        ) : error ? (
          <p style={{ padding: "24px" }}>
            Department data could not be loaded.
          </p>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              textAlign: "left",
              minWidth: "650px",
            }}
          >
            <thead style={{ background: "#f8f9fc" }}>
              <tr>
                {[
                  "Department",
                  "Manager",
                  "Officers",
                  "Total incidents",
                  "Open incidents",
                  "Resolved",
                  "Manage",
                ].map((heading) => (
                  <th
                    key={heading}
                    style={{
                      padding: "16px 20px",
                      color: "#78849b",
                      fontSize: "12px",
                      textTransform: "uppercase",
                      borderBottom: "1px solid #e5e9f2",
                    }}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {departments.map((department) => (
                <tr key={department.department_id}>
                  <td
                    style={{
                      padding: "20px",
                      fontWeight: 650,
                      borderBottom: "1px solid #edf0f6",
                    }}
                  >
                    {editingDepartmentId === department.department_id ? (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void saveDepartment("PATCH", {
                            department_id: department.department_id,
                            department_name: editingDepartmentName,
                          });
                        }}
                      >
                        <input
                          value={editingDepartmentName}
                          onChange={(event) =>
                            setEditingDepartmentName(event.target.value)
                          }
                          maxLength={120}
                          required
                          autoFocus
                          style={{
                            width: "100%",
                            padding: "8px",
                            border: "1px solid #dfe3ed",
                            borderRadius: "7px",
                          }}
                        />
                      </form>
                    ) : department.department_name}
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#8a94a8",
                        marginTop: "6px",
                      }}
                    >
                      Department ID: {department.department_id}
                    </div>
                  </td>

                  <td style={{ padding: "20px", borderBottom: "1px solid #edf0f6" }}>
                    {department.manager_name ?? "Manager setup required"}
                    <div style={{ fontSize: "12px", color: "#8a94a8", marginTop: "6px" }}>
                      {department.manager_has_login
                        ? department.manager_email
                        : "Login not configured"}
                    </div>
                  </td>
                  <td style={{ padding: "20px", borderBottom: "1px solid #edf0f6" }}>
                    {department.officer_count}
                  </td>
                  <td
                    style={{
                      padding: "20px",
                      borderBottom: "1px solid #edf0f6",
                    }}
                  >
                    {department.total_incidents}
                  </td>

                  <td
                    style={{
                      padding: "20px",
                      color: "#b7791f",
                      borderBottom: "1px solid #edf0f6",
                    }}
                  >
                    {department.open_incidents}
                  </td>

                  <td
                    style={{
                      padding: "20px",
                      color: "#059669",
                      borderBottom: "1px solid #edf0f6",
                    }}
                  >
                    {department.resolved_incidents}
                  </td>

                  <td
                    style={{
                      padding: "20px",
                      borderBottom: "1px solid #edf0f6",
                    }}
                  >
                    {editingDepartmentId === department.department_id ? (
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() =>
                            void saveDepartment("PATCH", {
                              department_id: department.department_id,
                              department_name: editingDepartmentName,
                            })
                          }
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingDepartmentId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingDepartmentId(department.department_id);
                          setEditingDepartmentName(department.department_name);
                        }}
                      >
                        Rename
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
