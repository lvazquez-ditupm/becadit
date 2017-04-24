#' Joint anomaly discovery function for my scolarship
#'
#' This function allows you find common anomalies between all variables of the dataset
#' @param file The absolute path of the dataset.
#' @param config The absolute path of the config file
#' @param var1 The name of the main variable
#' @keywords anomaly anomalies DBSCAN
#' @export
#' @examples
#' findAllJointAnomalies()

findAllJointAnomalies <- function(file, configFile) {
  library(jsonlite)
  library(dbscan)
  config <- fromJSON(configFile)
  names = config$names
  dataInFile <- read.csv(file, header = FALSE, col.names = names)
  reducedDataSet <- dataInFile[complete.cases(dataInFile),]
  types = config$types
  times = config$times
  areThereAnoms <- matrix(nrow = length(times), ncol = length(times), dimnames = list(names, names))
  areThereAnoms[,] <- 0
  for (name in names) {
    if (times[name] != "Not a timestamp") {
      var1 = name
      if (types[var1] == "numerical") {
        if (sd(reducedDataSet[, var1]) == 0) {
          reducedDataSet[, var1] <- 1
        } else{
          normalizedvar1 <-
            (reducedDataSet[, var1] - min(reducedDataSet[, var1])) / (max(reducedDataSet[, var1]) - min(reducedDataSet[, var1]))
          reducedDataSet[, var1] <- normalizedvar1
        }
        minPts <- 3
        others <- names[!(names == var1)]
        for (var2 in others) {
          if (types[var2] == "numerical") {
            if (var(reducedDataSet[, var2]) == 0) {
              normalizedvar2 <-  matrix(1, 1, length(reducedDataSet[, var2]))[1, ]
            } else{
              normalizedvar2 <-
                (reducedDataSet[, var2] - min(reducedDataSet[, var2])) / (max(reducedDataSet[, var2]) - min(reducedDataSet[, var2]))
            }
            reducedDataSet[, var2] <- normalizedvar2
            eps <-
              sqrt((sd(reducedDataSet[, var1])) ^ 2 + (sd(reducedDataSet[, var2])) ^ 2) / 5.5
            clusters <-
              dbscan(reducedDataSet[, c(var1, var2)], eps, minPts, borderPoints = FALSE)$cluster
            clusters2 <- array(0, dim = dim(dataInFile)[1])
            j <- 1
            k <- 1
            for (i in complete.cases(dataInFile)){
              if(i){
                clusters2[k] <- clusters[j]
                j <- j+1
              }
              else{
                clusters2[k] <- 0
              }
              k <- k+1
            }
            areThereAnoms[var1, var2] <- sum(clusters2 == 0)
          }
        }
      }
    }
  }
  return(toJSON(list(anomsMatrix = areThereAnoms, dataset = file)))
}