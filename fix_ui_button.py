import sys

with open('ExportModal.tsx', 'r') as f:
    content = f.read()

old_button = """                                    <button
                                        onClick={() => handleDownloadChunk(chunk)}
                                        disabled={loadingChunkIndex !== null}
                                        className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {loadingChunkIndex === chunk.index ? (
                                            <>
                                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                                Generating...
                                            </>
                                        ) : (
                                            <>
                                                <i className="material-icons text-[18px]">download</i>
                                                Download
                                            </>
                                        )}
                                    </button>"""

new_button = """                                    {readyChunks[chunk.index] ? (
                                        <button
                                            onClick={() => handleSaveChunk(chunk.index)}
                                            className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                                        >
                                            <i className="material-icons text-[18px]">save_alt</i>
                                            Save to Device
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => handleDownloadChunk(chunk)}
                                            disabled={loadingChunkIndex !== null}
                                            className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
                                        >
                                            {loadingChunkIndex === chunk.index ? (
                                                <>
                                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                                    Generating...
                                                </>
                                            ) : (
                                                <>
                                                    <i className="material-icons text-[18px]">build</i>
                                                    Generate
                                                </>
                                            )}
                                        </button>
                                    )}"""

content = content.replace(old_button, new_button)

with open('ExportModal.tsx', 'w') as f:
    f.write(content)

