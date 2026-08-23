import { EmployeeManager } from "@/components/employee-manager";
import { requireAdminPage } from "@/lib/auth";
import { listUsers } from "@/lib/data";

export const metadata = { title: "员工管理" };

export default async function TeamPage() {
  await requireAdminPage();
  const users = await listUsers();
  const employees = users.filter((user) => user.role === "EMPLOYEE");

  return (
    <div className="page-shell">
      <header className="page-header">
        <div><span className="eyebrow">团队与排班资格</span><h1>员工管理</h1><p>添加账户，并设置只上白班、只上夜班和个人休息偏好。</p></div>
        <span className="header-count">{employees.filter((employee) => employee.active).length} 名启用员工</span>
      </header>
      <EmployeeManager employees={employees} />
    </div>
  );
}
