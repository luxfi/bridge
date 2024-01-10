import SearchData from "@/components/SearchData";

export default async function Page({ params }: { params: { searchParam: string } }) {
  return (
      <main className="w-full py-4 px-6 xl:px-0">
        <SearchData searchParam={params.searchParam} />
      </main>
  )
}
