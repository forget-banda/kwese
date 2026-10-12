import { controlClass, Field } from "@/components/bits";
import { LEAVE_REASONS } from "@/lib/format";

export function StudentFields({
  classes,
  categories,
  currencies,
  values,
}: {
  classes: { id: number; name: string }[];
  categories: { id: number; name: string }[];
  currencies: { code: string; symbol: string }[];
  values?: {
    surname?: string;
    first_name?: string;
    gender?: string;
    class_id?: number | null;
    category_id?: number | null;
    currency_code?: string;
    dob?: string | null;
    address?: string;
    guardian?: string;
    phone?: string;
    doctor?: string;
    emergency?: string;
    notes?: string;
  };
}) {
  const v = values ?? {};
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Surname">
          <input name="surname" defaultValue={v.surname ?? ""} className={controlClass} required />
        </Field>
        <Field label="First name">
          <input name="firstName" defaultValue={v.first_name ?? ""} className={controlClass} required />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Gender">
          <select name="gender" defaultValue={v.gender || "Female"} className={controlClass}>
            <option>Female</option>
            <option>Male</option>
          </select>
        </Field>
        <Field label="Date of birth" hint="Optional. A date that makes the pupil younger than 2 is refused.">
          <input type="date" name="dob" defaultValue={v.dob ?? ""} className={controlClass} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Class">
          <select name="classId" defaultValue={v.class_id ?? ""} className={controlClass} required>
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>{cls.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Fee category">
          <select name="categoryId" defaultValue={v.category_id ?? ""} className={controlClass} required>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Bill fees in">
          <select name="currency" defaultValue={v.currency_code ?? currencies[0]?.code} className={controlClass}>
            {currencies.map((currency) => (
              <option key={currency.code} value={currency.code}>{currency.code}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Address">
        <input name="address" defaultValue={v.address ?? ""} className={controlClass} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Parent or guardian">
          <input name="guardian" defaultValue={v.guardian ?? ""} className={controlClass} />
        </Field>
        <Field label="Phone">
          <input name="phone" defaultValue={v.phone ?? ""} className={controlClass} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Doctor">
          <input name="doctor" defaultValue={v.doctor ?? ""} className={controlClass} />
        </Field>
        <Field label="Emergency contact">
          <input name="emergency" defaultValue={v.emergency ?? ""} className={controlClass} />
        </Field>
      </div>
      <Field label="Notes">
        <textarea name="notes" defaultValue={v.notes ?? ""} className={`${controlClass} h-20 py-2`} />
      </Field>
    </>
  );
}

export function LeaveFields() {
  return (
    <>
      <Field label="Reason">
        <select name="reason" className={controlClass} required>
          {LEAVE_REASONS.map((reason) => (
            <option key={reason.id} value={reason.id}>{reason.label}</option>
          ))}
        </select>
      </Field>
      <Field label="Date">
        <input type="date" name="leftOn" className={controlClass} required />
      </Field>
      <Field label="Where they are going" hint="A transfer's new school, if you know it.">
        <input name="destination" className={controlClass} />
      </Field>
    </>
  );
}
