/** Background document-handlers. Loaded by the service worker. */
async function handleDocumentMessage(message) {
  try {
    switch (message.type) {
      case 'GET_DOCUMENTS_LIST':
        return await _getDocumentsList();

      case 'SEARCH_DOCUMENTS':
        return await _searchDocuments(message.query);

      case 'GET_DOCUMENT_CONTENT':
        return await _getDocumentContent(message.docId);

      case 'DELETE_DOCUMENT':
        return await _deleteDocument(message.docId);

      case 'LINK_DOCUMENT_TO_CODE':
        return await _linkDocumentToCode(message.docId, message.codeContext);

      case 'GET_LINKED_CODES_FOR_DOCUMENT':
        return await _getLinkedCodesForDocument(message.docId);

      default:
        return { error: 'Unknown document message type: ' + message.type };
    }
  } catch (error) {
    console.error('[Scribe:Background] Document handler error:', error);
    return { error: error.message || '操作失败' };
  }
}

/**
 * Gets list of all stored documents
 * @private
 * @async
 * @returns {Promise<{success: boolean, documents: Array}>}
 */
async function _getDocumentsList() {
  const result = await storagePromise('local', 'get', ['documents']);
  const documents = result.documents || [];

  return {
    success: true,
    documents: documents.map(doc => ({
      id: doc.id,
      name: doc.name,
      size: doc.size,
      type: doc.type,
      uploadTime: doc.uploadTime
    }))
  };
}

/**
 * Searches documents by query
 * @private
 * @async
 * @param {string} query - Search query
 * @returns {Promise<{success: boolean, documents: Array}>}
 */
async function _searchDocuments(query) {
  const result = await storagePromise('local', 'get', ['documents']);
  const allDocs = result.documents || [];
  const searchTerm = query.toLowerCase();

  const matchedDocs = allDocs.filter(doc =>
    doc.name.toLowerCase().includes(searchTerm) ||
    (doc.content && doc.content.toLowerCase().includes(searchTerm))
  );

  return {
    success: true,
    documents: matchedDocs
  };
}

/**
 * Gets content of a specific document
 * @private
 * @async
 * @param {string} docId - Document ID
 * @returns {Promise<{success: boolean, document?: Object, message?: string}>}
 */
async function _getDocumentContent(docId) {
  const result = await storagePromise('local', 'get', ['documents']);
  const allDocuments = result.documents || [];
  const document = allDocuments.find(doc => doc.id === docId);

  if (document) {
    return { success: true, document };
  } else {
    return { success: false, message: '文档不存在' };
  }
}

/**
 * Deletes a document
 * @private
 * @async
 * @param {string} docId - Document ID
 * @returns {Promise<{success: boolean, message?: string}>}
 */
async function _deleteDocument(docId) {
  const result = await storagePromise('local', 'get', ['documents']);
  const existingDocs = result.documents || [];
  const updatedDocs = existingDocs.filter(doc => doc.id !== docId);

  await storagePromise('local', 'set', { documents: updatedDocs });

  return {
    success: true,
    message: '文档删除成功'
  };
}

/**
 * Creates a link between document and code
 * @private
 * @async
 * @param {string} docId - Document ID
 * @param {Object} codeContext - Code context information
 * @returns {Promise<{success: boolean, link?: Object}>}
 */
async function _linkDocumentToCode(docId, codeContext) {
  const result = await storagePromise('local', 'get', ['documentCodeLinks']);
  const existingLinks = result.documentCodeLinks || [];

  const newLink = {
    id: generateDocumentId(),
    docId,
    codeContext,
    linkedAt: new Date().toISOString(),
    metadata: {
      codeType: codeContext.code ? detectCodeType(codeContext.code) : 'unknown',
      functionName: codeContext.code ? extractFunctionName(codeContext.code) : 'unknown',
      description: codeContext.description || ''
    }
  };

  existingLinks.push(newLink);
  await storagePromise('local', 'set', { documentCodeLinks: existingLinks });

  return {
    success: true,
    link: newLink
  };
}

/**
 * Gets all code links for a document
 * @private
 * @async
 * @param {string} docId - Document ID
 * @returns {Promise<{success: boolean, links: Array}>}
 */
async function _getLinkedCodesForDocument(docId) {
  const result = await storagePromise('local', 'get', ['documentCodeLinks']);
  const allLinks = result.documentCodeLinks || [];
  const linkedCodes = allLinks.filter(link => link.docId === docId);

  return {
    success: true,
    links: linkedCodes
  };
}
