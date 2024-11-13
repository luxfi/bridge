import axios from 'axios'

const getSettings = async () => {
  const settings = await axios.get(`${process.env.NEXT_PUBLIC_BACKEND_API}/setttings?version=${process.env.NEXT_PUBLIC_API_VERSION}`)
  return settings
}

export default getSettings
