import bcrypt from "bcryptjs";
import pg from "pg";

const { Client } = pg;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("缺少 DATABASE_URL，无法初始化数据");
}

const adminUsername = process.env.ADMIN_INITIAL_USERNAME ?? "admin";
const adminPassword = process.env.ADMIN_INITIAL_PASSWORD ?? "RosterMind@2026";
const seedDemoData = process.env.SEED_DEMO_DATA === "true";
const client = new Client({ connectionString: databaseUrl });

await client.connect();

try {
  const adminHash = await bcrypt.hash(adminPassword, 12);
  await client.query(
    `
      INSERT INTO users (username, name, password_hash, role, rotation_order)
      VALUES ($1, '系统管理员', $2, 'ADMIN', -1)
      ON CONFLICT (username) DO NOTHING
    `,
    [adminUsername, adminHash],
  );

  if (seedDemoData) {
    const demoPassword = process.env.DEMO_USER_PASSWORD ?? "Welcome123!";
    const demoHash = await bcrypt.hash(demoPassword, 12);
    const demoUsers = [
      ["anxin", "安心", "DAY_ONLY", "CONSECUTIVE", 0],
      ["baichuan", "白川", "ANY", "WEEKEND", 1],
      ["chenchen", "陈晨", "ANY", "WEEKDAY", 2],
      ["duning", "杜宁", "ANY", "SCATTERED", 3],
    ];

    for (const [username, name, restriction, preference, rotationOrder] of demoUsers) {
      await client.query(
        `
          INSERT INTO users (
            username,
            name,
            password_hash,
            role,
            shift_restriction,
            rest_preference,
            rotation_order
          )
          VALUES ($1, $2, $3, 'EMPLOYEE', $4, $5, $6)
          ON CONFLICT (username) DO NOTHING
        `,
        [username, name, demoHash, restriction, preference, rotationOrder],
      );
    }
  }

  console.log(`管理员账户已就绪：${adminUsername}`);
  if (seedDemoData) {
    console.log("四名演示员工已就绪");
  }
} finally {
  await client.end();
}
