#' Joint anomaly discovery function for my Bachelor's Thesis
#'
#' This function allows you find common anomalies between one variable and all other variables in a dataset.
#' @param file The absolute path of the dataset.
#' @param config The absolute path of the config file
#' @param var1 The name of the main variable
#' @keywords anomaly anomalies DBSCAN
#' @export
#' @examples
#' findJointAnomalies()

findJointAnomalies <- function(file, config) {
  library(jsonlite)
  library(dbscan)
  config = fromJSON(config)
  dataInFile <- read.csv(file, header = TRUE, check.names = FALSE)
  reducedDataSet <- dataInFile
  types = config$types
  times = config$times
  names = config$names
  for (timeType in times) {
    if (timeType != "Not a timestamp") {
      var1 = names[match(timeType, times)]
      if (types[var1] == "numerical") {
        normalizedvar1 <-
          (reducedDataSet[, var1] - min(reducedDataSet[, var1])) / (max(reducedDataSet[, var1]) - min(reducedDataSet[, var1]))
        
        reducedDataSet[, var1] <- normalizedvar1
        
        minPts <- fromJSON(config)$minPts
        if (is.null(minPts)) {
          minPts <- 3
        }
        names = fromJSON(config)$names
        others <- names[!(names == var1)]
        
        clusters <- reducedDataSet[, others]
        areThereAnoms <- reducedDataSet[, others]
        areThereAnoms[, ] <- FALSE
        anomaliesVars <- reducedDataSet[, 1]
        var2 <- "temp"
        for (var2 in others) {
          if (types[var2] == "numerical") {
            if (var(reducedDataSet[, var2]) == 0) {
              normalizedvar2 <-  matrix(1, 1, length(reducedDataSet[, var2]))[1, ]
            } else{
              normalizedvar2 <-
                (reducedDataSet[, var2] - min(reducedDataSet[, var2])) / (max(reducedDataSet[, var2]) -
                                                                            min(reducedDataSet[, var2]))
            }
            reducedDataSet[, var2] <- normalizedvar2
            eps <- fromJSON(config)$eps
            if (is.null(eps)) {
              eps <-
                sqrt((sd(reducedDataSet[, var1])) ^ 2 + (sd(reducedDataSet[, var2])) ^ 2) / 5.5
            }
            
            clusters[var2] <-
              dbscan(reducedDataSet[, c(var1, var2)], eps, minPts, borderPoints = FALSE)$cluster
          }
        }
        
        #clusters <- optics(reducedDataSet, eps, minPts, eps)$cluster
        anomaliesByRows <-
          apply(clusters, 1, function(x)
            sum(x == 0, na.rm = TRUE))
        anomaliesByCols <-
          apply(clusters, 2, function(x)
            sum(x == 0, na.rm = TRUE))
        # , indices = rownames(jointAnomalies)
        areThereAnoms <- clusters == 0
        for (i in 0:nrow(clusters)) {
          if (length(others[areThereAnoms[i, ] == TRUE]) > 0) {
            anomaliesVars[i] <- toString(others[areThereAnoms[i, ] == TRUE])
          } else{
            anomaliesVars[i] <- "NONE"
          }
        }
      }
    }
    
    return(toJSON(
      list(
        anomsWithVars = anomaliesVars
      )
    ))
    #  qplot(reducedDataSet[,var1], numberOfAnomalies)
  } else{
    return(toJSON(list(error = "Main variable isn't numerical")))
  }
}