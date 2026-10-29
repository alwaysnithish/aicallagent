import { createBusiness } from "../actions";

export default async function NewBusiness({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="narrow">
      <h1>Create a business</h1>
      <p className="sub">Each business gets its own private workspace. You become its owner.</p>
      {error && <div className="notice er">{error}</div>}
      <form className="card" action={createBusiness}>
        <label htmlFor="name">Business name</label>
        <input id="name" name="name" required maxLength={80} />
        <label htmlFor="category">Type of business (optional)</label>
        <input id="category" name="category" maxLength={60} placeholder="Salon, clinic, restaurant..." />
        <div className="actions"><button className="btn primary" type="submit">Create business</button></div>
      </form>
    </div>
  );
}
