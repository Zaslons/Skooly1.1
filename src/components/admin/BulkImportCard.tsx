'use client';

import React, { useState, useRef, ReactNode } from 'react';
import Papa from 'papaparse';
import { useFormState } from 'react-dom';

// Generic type for parsed data row (adjust based on actual needs)
type ParsedDataRow = Record<string, string | null | undefined>;

// Reusable result type (matching the one from actions.ts)
type BulkActionResult = {
    successCount: number;
    errorCount: number;
    errors: { index: number, identifier?: string | null, message: string }[];
};
type BulkActionState = BulkActionResult | null;

// Props for the reusable component
interface BulkImportCardProps {
    title: string;
    templateUrl: string;
    templateFilename: string;
    requiredHeaders: string[];
    action: (currentState: BulkActionState, data: any[]) => Promise<BulkActionResult>; // Accept any[] for data type flexibility
    children?: ReactNode; // Optional: For specific instructions or notes
}

const BulkImportCard: React.FC<BulkImportCardProps> = ({
    title,
    templateUrl,
    templateFilename,
    requiredHeaders,
    action,
    children
}) => {
    const [file, setFile] = useState<File | null>(null);
    const [parsedData, setParsedData] = useState<ParsedDataRow[]>([]);
    const [isParsing, setIsParsing] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Use the passed-in server action
    const [state, formAction] = useFormState<BulkActionState, ParsedDataRow[]>(action, null);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setParsedData([]);
        if (state) {
           // Reset state if a new file is selected
           formAction([]);
        }
        if (event.target.files && event.target.files[0]) {
            const selectedFile = event.target.files[0];
            if (selectedFile.type !== 'text/csv') {
                alert('Please select a CSV file.');
                setFile(null);
                if (fileInputRef.current) { fileInputRef.current.value = ''; }
                return;
            }
            setFile(selectedFile);
            parseFile(selectedFile);
        } else {
             setFile(null); // Clear file if selection is cancelled
        }
    };

    const parseFile = (fileToParse: File) => {
        setIsParsing(true);
        Papa.parse<ParsedDataRow>(fileToParse, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                const actualHeaders = results.meta.fields;
                if (!actualHeaders || !requiredHeaders.every(h => actualHeaders.includes(h))) {
                    alert(`CSV file is missing required headers for ${title}.\nNeeded: ${requiredHeaders.join(', ')}\nFound: ${actualHeaders?.join(', ')}`);
                    resetState();
                } else {
                    // Basic mapping - server action will handle detailed validation/transformation
                     const mappedData = results.data.map(row => {
                        // Trim whitespace from all values
                        const trimmedRow: ParsedDataRow = {};
                        for (const key in row) {
                            if (Object.prototype.hasOwnProperty.call(row, key)) {
                                const value = row[key];
                                trimmedRow[key] = typeof value === 'string' ? value.trim() : value;
                            }
                        }
                        return trimmedRow;
                    });
                    setParsedData(mappedData);
                }
                setIsParsing(false);
            },
            error: (error) => {
                console.error('Error parsing CSV:', error);
                alert('Error parsing CSV file. Check console for details.');
                resetState();
                setIsParsing(false);
            }
        });
    };

     const resetState = () => {
        setParsedData([]);
        setFile(null);
        if (fileInputRef.current) { fileInputRef.current.value = ''; }
        setIsParsing(false);
        setIsSubmitting(false);
        formAction([]); // Reset form state
    }

    const handleSubmit = async () => {
        if (parsedData.length === 0) {
            alert("No data parsed from file to submit.");
            return;
        }
        setIsSubmitting(true);
        // Pass parsed data directly to the action
        await formAction(parsedData);
        setIsSubmitting(false);
         // Optionally clear file/parsed data after submission?
         // resetState(); // Uncomment to clear form after submit
    };

    return (
        <div className="bg-white p-6 rounded-md shadow-md flex flex-col gap-6 border border-gray-200">
            <h2 className="text-xl font-semibold">{title}</h2>

             {children && <div className="text-sm text-gray-600">{children}</div>}

            <div className="border border-dashed border-gray-300 p-4 rounded-md text-center">
                <p className="text-sm text-gray-600 mb-2">
                    Upload a CSV file. Ensure it follows the template format.
                </p>
                <a
                    href={templateUrl}
                    download={templateFilename}
                    className="text-sm text-blue-600 hover:underline mb-4 inline-block"
                >
                    Download Template ({templateFilename})
                </a>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileChange}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50 disabled:pointer-events-none"
                    disabled={isParsing || isSubmitting}
                />
                {isParsing && <p className="text-sm text-gray-500 mt-2">Parsing file...</p>}
            </div>

            {parsedData.length > 0 && (
                <div className="flex flex-col items-start gap-4"> {/* Changed alignment */}
                    <p className="text-sm font-medium">Previewing {parsedData.length} records from "{file?.name}". Ready to submit.</p>
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting || isParsing}
                        className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50 disabled:cursor-not-allowed" // Removed w-max
                    >
                        {isSubmitting ? 'Submitting...' : `Submit ${parsedData.length} Records`}
                    </button>
                </div>
            )}

            {/* Results Display */}
            {state && (
                 <div className="mt-4 p-4 border rounded-md bg-gray-50">
                    <h3 className="text-lg font-semibold mb-2">Import Results:</h3>
                    {state.successCount > 0 && <p className="text-green-700">Successfully imported: {state.successCount}</p>}
                    {state.errorCount > 0 && <p className="text-red-700">Failed: {state.errorCount}</p>}
                    {state.errors && state.errors.length > 0 && (
                        <div className="mt-3">
                            <h4 className="font-semibold mb-1">Errors:</h4>
                            <ul className="list-disc list-inside max-h-60 overflow-y-auto text-sm text-red-600 space-y-1">
                                {state.errors.map((err, idx) => (
                                    <li key={idx}>
                                        {/* Improved error display */}
                                        {err.index !== -1 ? `Row ${err.index} ` : ''}
                                        {err.identifier ? `(Identifier: ${err.identifier}) ` : ''}
                                        {err.message}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {/* Add a message if there are no errors and some successes */}
                    {state.errorCount === 0 && state.successCount > 0 && (
                        <p className="text-green-700 mt-2">All submitted records imported successfully.</p>
                    )}
                     {/* Add a message if the action was called but resulted in 0 success/errors (e.g., empty file submitted after parsing) */}
                     {state.successCount === 0 && state.errorCount === 0 && (!state.errors || state.errors.length === 0) && (
                         <p className="text-gray-600 mt-2">No records were processed.</p>
                     )}
                </div>
            )}
        </div>
    );
};

export default BulkImportCard; 