interface TableBasicProps {
    title?: string;
    columns: string[];
    data: string[][];
}

const TableBasic = ({ title, columns, data }: TableBasicProps) => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-1 gap-6 text-base">
            <div>
                {title && (
                    <h3 className="text-base font-bold mb-2 dark:text-white">
                        {title}
                    </h3>
                )}
                <table className="w-full border-collapse text-base">
                    <thead>
                        <tr className="bg-gray-100 dark:bg-gray-700">
                            {columns.map((col, i) => (
                                <th
                                    key={i}
                                    className="border dark:border-gray-600 p-2 text-left dark:text-white"
                                >
                                    {col}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row, rowIndex) => (
                            <tr
                                key={rowIndex}
                                className={
                                    rowIndex % 2 === 0
                                        ? "bg-gray-50 dark:bg-gray-800"
                                        : "dark:bg-gray-900"
                                }
                            >
                                {row.map((cell, colIndex) => (
                                    <td
                                        key={colIndex}
                                        className="border dark:border-gray-600 p-2 dark:text-gray-300"
                                    >
                                        {cell}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default TableBasic;