import axios from 'axios'
import type AppSettings from '@/domain/types/app-settings'

// The response already carries swapPairs — the server builds settings from the
// same table it validates quotes against.
//
// This used to overwrite that with a local copy of the table, and the two had
// drifted: the local one was missing DOT and XRP entirely and did not list
// native SOL or TON as destinations, so six assets the bridge routes were
// unreachable in the UI. A second copy of a table is a copy that is already
// stale; the only question is when someone notices. There is now one, on the
// side that also enforces it.
const getSettings = async (): Promise<AppSettings | undefined> => {

  const { data } = await axios.get(
    import.meta.env.VITE_SERVER_URI + '/api/settings?version=' + import.meta.env.VITE_NET_VERSION
  )

  return data as AppSettings ?? undefined
}

export default getSettings
