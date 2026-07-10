type Props = {
    title: string;
    children: React.ReactNode;
};

function ResourceCard({ title, children }: Props) {

    return (

        <section className="resource-card">

            <h2>{title}</h2>

            {children}

        </section>

    );

}

export default ResourceCard;