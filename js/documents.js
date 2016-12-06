/*globals $,OC,fileDownloadPath,t,document,odf,alert,require,dojo,runtime,Handlebars */

$.widget('oc.documentGrid', {
	options : {
		context : '.documentslist',
		documents : {},
		sessions : {},
		members : {}
	},

	render : function(fileId){
		var that = this;
		jQuery.when(this._load(fileId))
			.then(function(){
				that._render();
				documentsMain.renderComplete = true;
			});
	},

	_load : function (fileId){
		var that = this;
		var url = 'apps/richdocuments/ajax/documents/list';
		var dataObj = {};
		if (fileId){
			url = 'apps/richdocuments/ajax/documents/get/{fileId}';
			dataObj = { fileId: fileId };
		}

		return $.getJSON(OC.generateUrl(url, dataObj))
			.done(function (result) {
				if (!result || result.status === 'error') {
					documentsMain.loadError = true;
					if (result && result.message) {
						documentsMain.loadErrorMessage = result.message;
					}
					else {
						documentsMain.loadErrorMessage = t('richdocuments', 'Failed to load the document, please contact your administrator.');
					}

					if (result && result.hint) {
						documentsMain.loadErrorHint = result.hint;
					}
				}
				else {
					that.options.documents = result.documents;
					that.options.sessions = result.sessions;
					that.options.members = result.members;
					documentsMain.urlsrc = result.documents[0].urlsrc;
					documentsMain.fullPath = result.documents[0].path;
				}
			})
			.fail(function(data){
				console.log(t('richdocuments','Failed to load documents.'));
			});
	},

	_render : function (data){
		var that = this,
			documents = data && data.documents || this.options.documents,
			sessions = data && data.sessions || this.options.sessions,
			members = data && data.members || this.options.members,
			hasDocuments = false
		;

		$(this.options.context + ' .document:not(.template,.progress)').remove();

		if (documentsMain.loadError) {
			$(this.options.context).after('<div id="errormessage">'
				+ '<p>' + documentsMain.loadErrorMessage + '</p><p>'
				+ documentsMain.loadErrorHint
				+ '</p></div>'
			);
			return;
		}
	}
});

$.widget('oc.documentOverlay', {
	options : {
		parent : 'document.body'
	},
	_create : function (){
		$(this.element).hide().appendTo(document.body);
	},
	show : function(){
		$(this.element).fadeIn('fast');
	},
	hide : function(){
		$(this.element).fadeOut('fast');
	}
});

var documentsMain = {
	isEditorMode : false,
	isViewerMode: false,
	isGuest : false,
	memberId : false,
	esId : false,
	ready :false,
	fileName: null,
	baseName: null,
	canShare : false,
	canEdit: false,
	loadError : false,
	loadErrorMessage : '',
	loadErrorHint : '',
	renderComplete: false, // false till page is rendered with all required data about the document(s)
	toolbar : '<div id="ocToolbar"><div id="ocToolbarInside"></div><span id="toolbar" class="claro"></span></div>',
	returnToDir : null, // directory where we started from in the 'Files' app

	UI : {
		/* Editor wrapper HTML */
		container : '<div id="mainContainer" class="claro">' +
					'</div>',

		viewContainer: '<div id="revViewerContainer" class="claro">' +
					   '<div id="revViewer"></div>' +
					   '</div>',

		revHistoryContainerTemplate: '<div id="revPanelContainer" class="loleaflet-font">' +
			'<div id="revPanelHeader">' +
			'<h2>Revision History</h2>' +
			'<span>{{filename}}</span>' +
			'<a class="closeButton"><img src={{closeButtonUrl}} width="22px" height="22px"></a>' +
			'</div>' +
			'<div id="revisionsContainer" class="loleaflet-font">' +
			'<ul></ul>' +
			'</div>' +
			'<input type="button" id="show-more-versions" class="loleaflet-font" value="{{moreVersionsLabel}}" />' +
			'</div>',

		revHistoryItemTemplate: '<li>' +
			'<a href="{{downloadUrl}}" class="downloadVersion has-tooltip" title="' + t('richdocuments', 'Download this revision') + '"><img src="{{downloadIconUrl}}" />' +
			'<a class="versionPreview"><span class="versiondate has-tooltip" title="{{formattedTimestamp}}">{{relativeTimestamp}}</span></a>' +
			'<a href="{{restoreUrl}}" class="restoreVersion has-tooltip" title="' + t('richdocuments', 'Restore this revision') + '"><img src="{{restoreIconUrl}}" />' +
			'</a>' +
			'</li>',

		/* Previous window title */
		mainTitle : '',
		/* Number of revisions already loaded */
		revisionsStart: 0,

		init : function(){
			documentsMain.UI.mainTitle = $('title').text();
		},

		showViewer: function(fileId, title){
			// remove previous viewer, if open, and set a new one
			if (documentsMain.isViewerMode) {
				$('#revViewer').remove();
				$('#revViewerContainer').prepend($('<div id="revViewer">'));
			}

			$.get(OC.generateUrl('apps/richdocuments/wopi/token/{fileId}', { fileId: fileId }),
				  function (result) {
					  // WOPISrc - URL that loolwsd will access (ie. pointing to ownCloud)
					  var wopiurl = window.location.protocol + '//' + window.location.host + OC.generateUrl('apps/richdocuments/wopi/files/{file_id}', {file_id: fileId});
					  var wopisrc = encodeURIComponent(wopiurl);

					  // urlsrc - the URL from discovery xml that we access for the particular
					  // document; we add various parameters to that.
					  // The discovery is available at
					  //   https://<loolwsd-server>:9980/hosting/discovery
					  var urlsrc = documentsMain.urlsrc +
						  "WOPISrc=" + wopisrc +
						  "&title=" + encodeURIComponent(title) +
						  "&lang=" + OC.getLocale() +
						  "&permission=readonly";

					  // access_token - must be passed via a form post
					  var access_token = encodeURIComponent(result.token);

					  // form to post the access token for WOPISrc
					  var form = '<form id="loleafletform_viewer" name="loleafletform_viewer" target="loleafletframe_viewer" action="' + urlsrc + '" method="post">' +
						  '<input name="access_token" value="' + access_token + '" type="hidden"/></form>';

					  // iframe that contains the Collabora Online Viewer
					  var frame = '<iframe id="loleafletframe_viewer" name= "loleafletframe_viewer" style="width:100%;height:100%;position:absolute;"/>';

					  $('#revViewer').append(form);
					  $('#revViewer').append(frame);

					  // submit that
					  $('#loleafletform_viewer').submit();
					  documentsMain.isViewerMode = true;
				  });

			// for closing revision mode
			$('#revPanelHeader .closeButton').click(function(e) {
				e.preventDefault();
				documentsMain.onCloseViewer();
			});
		},

		addRevision: function(fileId, version, relativeTimestamp, documentPath) {
			var formattedTimestamp = OC.Util.formatDate(parseInt(version) * 1000);
			var fileName = documentsMain.fileName.substring(0, documentsMain.fileName.indexOf('.'));
			var downloadUrl, restoreUrl;
			if (version === 0) {
				formattedTimestamp = t('richdocuments', 'Latest revision');
				downloadUrl = OC.generateUrl('apps/files/download'+ documentPath);
				fileId = fileId.replace(/_.*/, '');
			} else {
				downloadUrl = OC.generateUrl('apps/files_versions/download.php?file={file}&revision={revision}',
				                             {file: documentPath, revision: version});
				fileId = fileId + '_' + version;
				restoreUrl = OC.generateUrl('apps/files_versions/ajax/rollbackVersion.php?file={file}&revision={revision}',
				                             {file: documentPath, revision: version});
			}

			var revHistoryItemTemplate = Handlebars.compile(documentsMain.UI.revHistoryItemTemplate);
			var html = revHistoryItemTemplate({
				downloadUrl: downloadUrl,
				downloadIconUrl: OC.imagePath('core', 'actions/download'),
				restoreUrl: restoreUrl,
				restoreIconUrl: OC.imagePath('core', 'actions/history'),
				relativeTimestamp: relativeTimestamp,
				formattedTimestamp: formattedTimestamp
			});

			html = $(html).attr('data-fileid', fileId)
				          .attr('data-title', fileName + ' - ' + formattedTimestamp);
			$('#revisionsContainer ul').append(html);
		},

		fetchAndFillRevisions: function(documentPath) {
			// fill #rev-history with file versions
			$.get(OC.generateUrl('apps/files_versions/ajax/getVersions.php?source={documentPath}&start={start}',
			                     { documentPath: documentPath, start: documentsMain.UI.revisionsStart }),
				  function(result) {
					  for(var key in result.data.versions) {
						  documentsMain.UI.addRevision(documentsMain.fileId,
						                               result.data.versions[key].version,
						                               result.data.versions[key].humanReadableTimestamp,
						                               documentPath);
					  }

					  // owncloud only gives 5 version at max in one go
					  documentsMain.UI.revisionsStart += 5;

					  if (result.data.endReached) {
						  // Remove 'More versions' button
						  $('#show-more-versions').addClass('hidden');
					  }
				  });
		},

		showRevHistory: function(documentPath) {
			$(document.body).prepend(documentsMain.UI.viewContainer);

			var revHistoryContainerTemplate = Handlebars.compile(documentsMain.UI.revHistoryContainerTemplate);
			var revHistoryContainer = revHistoryContainerTemplate({
				filename: documentsMain.fileName,
				moreVersionsLabel: t('richdocuments', 'More versions...'),
				closeButtonUrl: OC.imagePath('core', 'actions/close')
			});
			$('#revViewerContainer').prepend(revHistoryContainer);

			documentsMain.UI.revisionsStart = 0;

			// append current document first
			documentsMain.UI.addRevision(documentsMain.fileId, 0, t('richdocuments', 'Just now'), documentPath);

			// add "Show more versions" button
			$('#show-more-versions').click(function(e) {
				e.preventDefault();
				documentsMain.UI.fetchAndFillRevisions(documentPath);
			});

			// fake click to load first 5 versions
			$('#show-more-versions').click();

			// make these revisions clickable/attach functionality
			$('#revisionsContainer').on('click', '.versionPreview', function(e) {
				e.preventDefault();
				documentsMain.UI.showViewer(e.currentTarget.parentElement.dataset.fileid,
				                            e.currentTarget.parentElement.dataset.title);

				// mark only current <li> as active
				$(e.currentTarget.parentElement.parentElement).find('li').removeClass('active');
				$(e.currentTarget.parentElement).addClass('active');
			});

			$('#revisionsContainer').on('click', '.restoreVersion', function(e) {
				e.preventDefault();

				// close the viewer
				documentsMain.onCloseViewer();

				// close the editor
				documentsMain.UI.hideEditor();

				// If there are changes in the opened editor, we need to wait
				// for sometime before these changes can be saved and a revision is created for it,
				// before restoring to requested version.
				documentsMain.overlay.documentOverlay('show');
				setTimeout(function() {
					// restore selected version
					$.ajax({
						type: 'GET',
						url: e.currentTarget.href,
						success: function(response) {
							if (response.status === 'error') {
								documentsMain.UI.notify(t('richdocuments', 'Failed to revert the document to older version'));
							}

							// generate file id with returnToDir information in it, if any
							var fileid = e.currentTarget.parentElement.dataset.fileid.replace(/_.*/, '') +
							    (documentsMain.returnToDir ? '_' + documentsMain.returnToDir : '');

							// load the file again, it should get reverted now
							window.location = OC.generateUrl('apps/richdocuments/index#{fileid}', {fileid: fileid});
							window.location.reload();
							documentsMain.overlay.documentOverlay('hide');
						}
					});
				}, 1000);
			});

			// fake click on first revision (i.e current revision)
			$('#revisionsContainer li').first().find('.versionPreview').click();
		},

		showEditor : function(title, fileId, action){
			if (documentsMain.isGuest){
				// !Login page mess wih WebODF toolbars
				$(document.body).attr('id', 'body-user');
			}

			if (documentsMain.loadError) {
				documentsMain.onEditorShutdown(documentsMain.loadErrorMessage + '\n' + documentsMain.loadErrorHint);
				return;
			}

			if (!documentsMain.renderComplete) {
				setTimeout(function() { documentsMain.UI.showEditor(title, action); }, 500);
				console.log('Waiting for page to render ...');
				return;
			}

			$(document.body).addClass("claro");
			$(document.body).prepend(documentsMain.UI.container);

			$('title').text(title + ' - ' + documentsMain.UI.mainTitle);

			$.get(OC.generateUrl('apps/richdocuments/wopi/token/{fileId}', { fileId: fileId }),
				function (result) {
					if (!result || result.status === 'error') {
						if (result && result.message){
							documentsMain.UI.notify(result.message);
						}
						documentsMain.onEditorShutdown(t('richdocuments', 'Failed to aquire access token. Please re-login and try again.'));
						return;
					}

					// WOPISrc - URL that loolwsd will access (ie. pointing to ownCloud)
					var wopiurl = window.location.protocol + '//' + window.location.host + OC.generateUrl('apps/richdocuments/wopi/files/{file_id}', {file_id: documentsMain.fileId});
					var wopisrc = encodeURIComponent(wopiurl);

					// urlsrc - the URL from discovery xml that we access for the particular
					// document; we add various parameters to that.
					// The discovery is available at
					//	 https://<loolwsd-server>:9980/hosting/discovery
					var urlsrc = documentsMain.urlsrc +
						"WOPISrc=" + wopisrc +
						"&title=" + encodeURIComponent(title) +
						"&lang=" + OC.getLocale() +
						"&closebutton=1" +
						"&revisionhistory=1";
					if (!documentsMain.canEdit || action === "view") {
						urlsrc += "&permission=readonly";
					}

					// access_token - must be passed via a form post
					var access_token = encodeURIComponent(result.token);

					// form to post the access token for WOPISrc
					var form = '<form id="loleafletform" name="loleafletform" target="loleafletframe" action="' + urlsrc + '" method="post">' +
						'<input name="access_token" value="' + access_token + '" type="hidden"/></form>';

					// iframe that contains the Collabora Online
					var frame = '<iframe id="loleafletframe" name= "loleafletframe" allowfullscreen style="width:100%;height:100%;position:absolute;" />';

					$('#mainContainer').append(form);
					$('#mainContainer').append(frame);

					// Listen for App_LoadingStatus as soon as possible
					$('#loleafletframe').ready(function() {
						var editorInitListener = function(e) {
							var msg = JSON.parse(e.data);
							if (msg.MessageId === 'App_LoadingStatus') {
								window.removeEventListener('message', editorInitListener, false);
							}
						};
						window.addEventListener('message', editorInitListener, false);
					});

					$('#loleafletframe').load(function(){
						// And start listening to incoming post messages
						window.addEventListener('message', function(e){
							if (documentsMain.isViewerMode) {
								return;
							}

							try {
								var msg = JSON.parse(e.data).MessageId;
							} catch(exc) {
								msg = e.data;
							}
							if (msg === 'UI_Close' || msg === 'close') {
								documentsMain.onClose();
							} else if (msg === 'rev-history') {
								documentsMain.UI.showRevHistory(documentsMain.fullPath);
							}
						});

						// Tell the LOOL iframe that we are ready now
						documentsMain.WOPIPostMessage($('#loleafletframe')[0], 'Host_PostmessageReady', {});

						// LOOL Iframe is ready, turn off our overlay
						// This should ideally be taken off when we receive App_LoadingStatus, but
						// for backward compatibility with older lool, lets keep it here till we decide
						// to break older lools
						documentsMain.overlay.documentOverlay('hide');
					});

					// submit that
					$('#loleafletform').submit();

			});
		},

		hideEditor : function(){
			if (documentsMain.isGuest){
				// !Login page mess wih WebODF toolbars
				$(document.body).attr('id', 'body-login');
				$('footer,nav').show();
			}

			// Fade out editor
			$('#mainContainer').fadeOut('fast', function() {
				$('#mainContainer').remove();
				$('#content-wrapper').fadeIn('fast');
				$(document.body).removeClass('claro');
				$('title').text(documentsMain.UI.mainTitle);
			});
		},

		showSave : function (){
			$('#odf-close').hide();
			$('#saving-document').show();
		},

		hideSave : function(){
			$('#saving-document').hide();
			$('#odf-close').show();
		},

		showProgress : function(message){
			if (!message){
				message = '&nbsp;';
			}
			$('.documentslist .progress div').text(message);
			$('.documentslist .progress').show();
		},

		hideProgress : function(){
			$('.documentslist .progress').hide();
		},

		notify : function(message){
			OC.Notification.show(message);
			setTimeout(OC.Notification.hide, 10000);
		}
	},

	onStartup: function() {
		var fileId;
		documentsMain.UI.init();

		if (!OC.currentUser){
			documentsMain.isGuest = true;

			if ($("[name='document']").val()){
				$(documentsMain.toolbar).appendTo('#header');
				documentsMain.prepareSession();
				documentsMain.joinSession(
					$("[name='document']").val()
				);
			}

		} else {
			// Does anything indicate that we need to autostart a session?
			fileId = parent.location.hash.replace(/^\W*/, '');

			if (fileId.indexOf('_') >= 0) {
				documentsMain.returnToDir = unescape(fileId.replace(/^[^_]*_/, ''));
				fileId = fileId.replace(/_.*/, '');
			}
		}

		documentsMain.show(fileId);

		if (fileId) {
			documentsMain.overlay.documentOverlay('show');
			documentsMain.prepareSession();
			documentsMain.joinSession(fileId);
		}

		documentsMain.ready = true;
	},

	WOPIPostMessage: function(iframe, msgId, values) {
		if (iframe) {
			var msg = {
				'MessageId': msgId,
				'SendTime': Date.now(),
				'Values': values
			};

			iframe.contentWindow.postMessage(JSON.stringify(msg), '*');
		}
	},

	prepareSession : function(){
		documentsMain.isEditorMode = true;
		documentsMain.overlay.documentOverlay('show');
		$(window).on("unload", documentsMain.onTerminate);
	},

	initSession: function(response) {
		if(response && (response.id && !response.es_id)){
			return documentsMain.view(response.id);
		}

		$('footer,nav').hide();
		$(documentsMain.toolbar).appendTo('#header');

		if (!response || !response.status || response.status==='error'){
			documentsMain.onEditorShutdown(t('richdocuments', 'Failed to load this document. Please check if it can be opened with an external editor. This might also mean it has been unshared or deleted recently.'));
			return;
		}

		//Wait for 3 sec if editor is still loading
		if (!documentsMain.ready){
			setTimeout(function(){ documentsMain.initSession(response); }, 3000);
			console.log('Waiting for the editor to start...');
			return;
		}

		documentsMain.canShare = !documentsMain.isGuest
				&& typeof OC.Share !== 'undefined' && response.permissions & OC.PERMISSION_SHARE;

		// fade out file list and show the cloudsuite
		$('#content-wrapper').fadeOut('fast').promise().done(function() {

			documentsMain.fileId = response.file_id;
			documentsMain.fileName = response.title;

			documentsMain.esId = response.es_id;
			documentsMain.memberId = response.member_id;
			documentsMain.canEdit = response.permissions & OC.PERMISSION_UPDATE;

			documentsMain.loadDocument(response);

			if (documentsMain.isGuest){
				$('#odf-close').text(t('richdocuments', 'Save') );
				$('#odf-close').removeClass('icon-view-close');
			}
		});
	},


	joinSession: function(fileId) {
		console.log('joining session '+fileId);
		var url;
		if (documentsMain.isGuest){
			url = OC.generateUrl('apps/richdocuments/session/guest/join/{token}', {token: fileId});
		} else {
			url = OC.generateUrl('apps/richdocuments/session/user/join/{file_id}', {file_id: fileId});
		}
		$.post(
			url,
			{ name : $("[name='memberName']").val() },
			documentsMain.initSession
		);
	},

	view : function(id){
		OC.addScript('richdocuments', 'viewer/viewer', function() {
			$(window).off('beforeunload');
			$(window).off('unload');
			var path = $('li[data-id='+ id +']>a').attr('href');
			odfViewer.isDocuments = true;
			odfViewer.onView(path);
		});
	},

	loadDocument: function(response) {
		documentsMain.UI.showEditor(response.title, response.file_id, 'write');
	},

	onEditorShutdown : function (message){
			OC.Notification.show(message);

			$(window).off('beforeunload');
			$(window).off('unload');
			if (documentsMain.isEditorMode){
				documentsMain.isEditorMode = false;
				parent.location.hash = "";
			} else {
				setTimeout(OC.Notification.hide, 7000);
			}
			documentsMain.UI.hideEditor();

			documentsMain.show();
			$('footer,nav').show();
	},


	onClose: function() {
		if (!documentsMain.isEditorMode){
			return;
		}
		documentsMain.isEditorMode = false;
		$(window).off('beforeunload');
		$(window).off('unload');
		parent.location.hash = "";

		$('footer,nav').show();
		documentsMain.UI.hideEditor();
		$('#ocToolbar').remove();

		if (documentsMain.returnToDir) {
			window.location = OC.generateUrl('apps/files?dir={dir}', {dir: documentsMain.returnToDir});
		} else {
			documentsMain.show();
		}
	},

	onCloseViewer: function() {
		$('#revisionsContainer *').off();

		$('#revPanelContainer').remove();
		$('#revViewerContainer').remove();
		documentsMain.isViewerMode = false;
		documentsMain.UI.revisionsStart = 0;

		$('#loleafletframe').focus();
	},

	onTerminate: function(){
		var url = '';
		if (documentsMain.isGuest){
			url = OC.generateUrl('apps/richdocuments/ajax/user/disconnectGuest/{member_id}', {member_id: documentsMain.memberId});
		} else {
			url = OC.generateUrl('apps/richdocuments/ajax/user/disconnect/{member_id}', {member_id: documentsMain.memberId});
		}
		$.ajax({
				type: "POST",
				url: url,
				data: {esId: documentsMain.esId},
				dataType: "json",
				async: false // Should be sync to complete before the page is closed
		});

		if (documentsMain.isGuest){
			$('footer,nav').show();
		}
	},

	show: function(fileId){
		if (documentsMain.isGuest){
			return;
		}
		documentsMain.UI.showProgress(t('richdocuments', 'Loading documents...'));
		documentsMain.docs.documentGrid('render', fileId);
		documentsMain.UI.hideProgress();
	}
};

//init
var Files = Files || {
	// FIXME: copy/pasted from Files.isFileNameValid, needs refactor into core
	isFileNameValid:function (name) {
		if (name === '.') {
			throw t('files', '\'.\' is an invalid file name.');
		} else if (name.length === 0) {
			throw t('files', 'File name cannot be empty.');
		}

		// check for invalid characters
		var invalid_characters = ['\\', '/', '<', '>', ':', '"', '|', '?', '*'];
		for (var i = 0; i < invalid_characters.length; i++) {
			if (name.indexOf(invalid_characters[i]) !== -1) {
				throw t('files', "Invalid name, '\\', '/', '<', '>', ':', '\"', '|', '?' and '*' are not allowed.");
			}
		}
		return true;
	},

	updateStorageStatistics: function(){}
},
FileList = FileList || {};

FileList.getCurrentDirectory = function(){
	return $('#dir').val() || '/';
};

FileList.highlightFiles = function(files, highlightFunction) {
};

FileList.findFile = function(filename) {
	var documents = documentsMain.docs.documentGrid('option').documents;
	return _.find(documents, function(aFile) {
				return (aFile.name === filename);
			}) || false;
};

FileList.generatePreviewUrl = function(urlSpec) {
	urlSpec = urlSpec || {};
	if (!urlSpec.x) {
		urlSpec.x = 32;
	}
	if (!urlSpec.y) {
		urlSpec.y = 32;
	}
	urlSpec.x *= window.devicePixelRatio;
	urlSpec.y *= window.devicePixelRatio;
	urlSpec.x = Math.ceil(urlSpec.x);
	urlSpec.y = Math.ceil(urlSpec.y);
	urlSpec.forceIcon = 0;
	return OC.generateUrl('/core/preview.png?') + $.param(urlSpec);
};

FileList.isFileNameValid = function (name) {
	var trimmedName = name.trim();
	if (trimmedName === '.'	|| trimmedName === '..') {
		throw t('files', '"{name}" is an invalid file name.', {name: name});
	} else if (trimmedName.length === 0) {
		throw t('files', 'File name cannot be empty.');
	}
	return true;
};

FileList.setViewerMode = function(){
};
FileList.findFile = function(fileName){
	fullPath = escapeHTML(FileList.getCurrentDirectory + '/' + fileName);
	return !!$('.documentslist .document:not(.template,.progress) a[original-title="' + fullPath + '"]').length;
};

$(document).ready(function() {

	if (!OCA.Files) {
		OCA.Files = {};
		OCA.Files.App = {};
		OCA.Files.App.fileList = FileList;
	}

	if (!OC.Share) {
		OC.Share = {};
	}

	window.Files = FileList;

	documentsMain.docs = $('.documentslist').documentGrid();
	documentsMain.overlay = $('<div id="documents-overlay" class="icon-loading"></div><div id="documents-overlay-below" class="icon-loading-dark"></div>').documentOverlay();

	$('li.document a').tipsy({fade: true, live: true});


	documentsMain.onStartup();
});
