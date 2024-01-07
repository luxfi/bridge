export default function CardContainer(props :  React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>) {
    return (<div {...props}>
        <div className="bg-level-1 darkest-class shadow-card rounded-lg w-full mt-10 overflow-hidden relative">
            <div className="relative overflow-hidden h-1 flex rounded-t-lg bg-level-4 darker-hover-class"></div>
            <div className="p-2">
                {props.children}
            </div>
        </div>
    </div>);
}