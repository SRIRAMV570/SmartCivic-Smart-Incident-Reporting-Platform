
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { authenticateRequest } from "@/lib/auth/authenticate";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const result = await pool.query(
      `SELECT
         u.user_id,
         u.full_name,
         u.department_id,
         d.department_name,
         u.is_manager,
         a.email
       FROM users u
       LEFT JOIN departments d
         ON u.department_id = d.department_id
       LEFT JOIN auth_accounts a
         ON u.auth_account_id = a.account_id
       WHERE u.role = 'officer'
         AND u.department_id IS NOT NULL
       ORDER BY d.department_name, u.is_manager DESC, u.full_name`
    );

    return NextResponse.json({
      success: true,
      count: result.rows.length,
      officers: result.rows,
    });
  } catch (error) {
    console.error("Officers API error:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to fetch officers.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await authenticateRequest(request, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "A valid JSON request is required." },
      { status: 400 }
    );
  }

  const values =
    body && typeof body === "object"
      ? (body as Record<string, unknown>)
      : {};
  const fullName = typeof values.full_name === "string" ? values.full_name.trim() : "";
  const email =
    typeof values.email === "string" ? values.email.trim().toLowerCase() : "";
  const password = typeof values.password === "string" ? values.password : "";
  const departmentId = Number(values.department_id);
  const isManager = values.is_manager === true;

  if (fullName.length < 2 || fullName.length > 100) {
    return NextResponse.json(
      { success: false, message: "Name must be between 2 and 100 characters." },
      { status: 400 }
    );
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { success: false, message: "Enter a valid email address." },
      { status: 400 }
    );
  }
  if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
    return NextResponse.json(
      { success: false, message: "Password must be at least 8 characters and no more than 72 bytes." },
      { status: 400 }
    );
  }
  if (!Number.isInteger(departmentId) || departmentId < 1) {
    return NextResponse.json(
      { success: false, message: "A valid department is required." },
      { status: 400 }
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const department = await client.query(
      "SELECT department_id FROM departments WHERE department_id = $1",
      [departmentId]
    );
    if (department.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, message: "Department not found." },
        { status: 404 }
      );
    }

    let userId: string | number;
    if (isManager) {
      const currentManager = await client.query(
        `SELECT user_id, auth_account_id
         FROM users
         WHERE department_id = $1
           AND role = 'officer'
           AND is_manager = true
         FOR UPDATE`,
        [departmentId]
      );

      if (currentManager.rowCount && currentManager.rows[0].auth_account_id) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { success: false, message: "This department already has a manager with login credentials." },
          { status: 409 }
        );
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const account = await client.query(
        `INSERT INTO auth_accounts (full_name, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING account_id`,
        [fullName, email, passwordHash]
      );

      if (currentManager.rowCount) {
        userId = currentManager.rows[0].user_id;
        await client.query(
          `UPDATE users
           SET full_name = $1, auth_account_id = $2
           WHERE user_id = $3`,
          [fullName, account.rows[0].account_id, userId]
        );
      } else {
        const user = await client.query(
          `INSERT INTO users
             (full_name, department_id, role, auth_account_id, is_manager)
           VALUES ($1, $2, 'officer', $3, true)
           RETURNING user_id`,
          [fullName, departmentId, account.rows[0].account_id]
        );
        userId = user.rows[0].user_id;
      }
    } else {
      const manager = await client.query(
        `SELECT user_id
         FROM users
         WHERE department_id = $1
           AND role = 'officer'
           AND is_manager = true
           AND auth_account_id IS NOT NULL
         FOR UPDATE`,
        [departmentId]
      );
      if (manager.rowCount === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { success: false, message: "Configure this department's manager login before adding officers." },
          { status: 409 }
        );
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const account = await client.query(
        `INSERT INTO auth_accounts (full_name, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING account_id`,
        [fullName, email, passwordHash]
      );
      const user = await client.query(
        `INSERT INTO users
           (full_name, department_id, role, auth_account_id, is_manager)
         VALUES ($1, $2, 'officer', $3, false)
         RETURNING user_id`,
        [fullName, departmentId, account.rows[0].account_id]
      );
      userId = user.rows[0].user_id;
    }

    await client.query("COMMIT");
    return NextResponse.json(
      {
        success: true,
        officer: {
          user_id: userId,
          full_name: fullName,
          department_id: departmentId,
          email,
          is_manager: isManager,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    await client.query("ROLLBACK");
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    ) {
      return NextResponse.json(
        { success: false, message: "That email is already in use, or this department already has a manager." },
        { status: 409 }
      );
    }

    console.error("Officer creation failed:", error);
    return NextResponse.json(
      { success: false, message: "Failed to create officer account." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

export async function PATCH(request: Request) {
  const auth = await authenticateRequest(request, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "A valid JSON request is required." },
      { status: 400 }
    );
  }

  const values =
    body && typeof body === "object"
      ? (body as Record<string, unknown>)
      : {};
  const userId = Number(values.user_id);
  const fullName =
    typeof values.full_name === "string" ? values.full_name.trim() : "";
  const email =
    typeof values.email === "string" ? values.email.trim().toLowerCase() : "";
  const password =
    typeof values.password === "string" ? values.password : "";

  if (!Number.isInteger(userId) || userId < 1) {
    return NextResponse.json(
      { success: false, message: "A valid officer ID is required." },
      { status: 400 }
    );
  }
  if (fullName.length < 2 || fullName.length > 100) {
    return NextResponse.json(
      { success: false, message: "Name must be between 2 and 100 characters." },
      { status: 400 }
    );
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { success: false, message: "Enter a valid email address." },
      { status: 400 }
    );
  }
  if (password && (password.length < 8 || Buffer.byteLength(password, "utf8") > 72)) {
    return NextResponse.json(
      { success: false, message: "Password must be at least 8 characters and no more than 72 bytes." },
      { status: 400 }
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const officer = await client.query(
      `SELECT user_id, auth_account_id
       FROM users
       WHERE user_id = $1
         AND role = 'officer'
         AND department_id IS NOT NULL
       FOR UPDATE`,
      [userId]
    );

    if (officer.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, message: "Officer account not found." },
        { status: 404 }
      );
    }
    if (!officer.rows[0].auth_account_id && !password) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, message: "Set a password to create this officer's login credentials." },
        { status: 400 }
      );
    }

    const passwordHash = password ? await bcrypt.hash(password, 12) : null;
    if (officer.rows[0].auth_account_id) {
      await client.query(
        `UPDATE auth_accounts
         SET full_name = $1,
             email = $2,
             password_hash = COALESCE($3, password_hash)
         WHERE account_id = $4`,
        [fullName, email, passwordHash, officer.rows[0].auth_account_id]
      );
    } else {
      const account = await client.query(
        `INSERT INTO auth_accounts (full_name, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING account_id`,
        [fullName, email, passwordHash]
      );
      await client.query(
        "UPDATE users SET auth_account_id = $1 WHERE user_id = $2",
        [account.rows[0].account_id, userId]
      );
    }
    await client.query(
      "UPDATE users SET full_name = $1 WHERE user_id = $2",
      [fullName, userId]
    );

    await client.query("COMMIT");
    return NextResponse.json({
      success: true,
      officer: { user_id: userId, full_name: fullName, email },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    ) {
      return NextResponse.json(
        { success: false, message: "That email is already in use." },
        { status: 409 }
      );
    }

    console.error("Officer update failed:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update officer credentials." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
