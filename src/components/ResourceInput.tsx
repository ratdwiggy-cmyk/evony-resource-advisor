type Props = {
    label: string;
    value: number;
    onChange: (value: number) => void;
};

function ResourceInput({ label, value, onChange }: Props) {
    return (
        <div className="input-group">

            <label>{label}</label>

            <input
                type="number"
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
            />

        </div>
    );
}

export default ResourceInput;