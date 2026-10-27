
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Department = {
  department_id: number;
  department_name: string;
  total_incidents: number;
  open_incidents: number;
  resolved_incidents: number;
};

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newDepartmentName, setNewDepartmentName] = useState("");
  const [editingDepartmentId, setEditingDepartmentId] = useState<number | null>(
    null
  );
  const [editingDepartmentName, setEditingDepartmentName] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveDepartment(
    method: "POST" | "PATCH",
    values: { department_name: string; department_id?: number }
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save department.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    async function loadDepartments() {
      try {
        const response = await fetch("/api/departments");
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.message || "Unable to load departments.");
        }

        setDepartments(data.departments);
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
      </form>

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
