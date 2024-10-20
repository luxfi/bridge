import Image from 'next/image'

const AvatarGroup: React.FC<{
  imageUrls: string[]
}
> = (({ 
  imageUrls 
}) => {
  return (
    <div className="">
      <div className="isolate flex -space-x-1 overflow-hidden p-1">
        {imageUrls.map(x => {
          return (
            <Image
              key={x}
              className="relative z-30 inline-block h-5 w-5 rounded-full ring-2 ring-foreground"
              src={x}
              width="60"
              height={60}
              alt=""
            />
          )
        })}
      </div>
    </div>
  )
});

export default AvatarGroup;