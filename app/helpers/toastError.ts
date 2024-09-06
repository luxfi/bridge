import toast from 'react-hot-toast';

export default (e: any) => {
  if (typeof e === 'string') { 
    toast.error(e as string)
  }
  else if (e instanceof String) {
    toast.error((e as String).valueOf())
  }
  else if (typeof e === 'object') {
    if (e instanceof Error) {
      toast.error(e.message)
    }
    else if ('message' in e) {
      toast.error(e.message)
    }
    else if ('toString' in e) {
      toast.error(e.toString())
    }
  }
}